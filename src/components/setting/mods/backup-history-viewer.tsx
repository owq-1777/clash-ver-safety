import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import RestoreRounded from '@mui/icons-material/RestoreRounded'
import { Box, Button, IconButton, List, ListItem, ListItemText, ListSubheader, Stack, Typography } from '@mui/material'
import { save } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseLoadingOverlay } from '@/components/base'
import { deleteLocalBackup, exportLocalBackup, listLocalBackup, restartApp, restoreLocalBackup } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'

dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)
const DATE_FORMAT = 'YYYY-MM-DD_HH-mm-ss'
const FILENAME_PATTERN = /\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/

interface BackupHistoryViewerProps { open: boolean; page: number; onPageChange: (page: number) => void; onClose: () => void }
interface BackupRow { filename: string; backupTime: dayjs.Dayjs | null; displayTime: string; sortValue: number }

export const BackupHistoryViewer = ({ open, page, onPageChange, onClose }: BackupHistoryViewerProps) => {
  const { t } = useTranslation()
  const [rows, setRows] = useState<BackupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [pending, setPending] = useState<{ action: 'delete' | 'restore'; filename: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const busy = loading || isRestoring || isRestarting || confirming

  const buildRow = useCallback((item: ILocalBackupFile): BackupRow | null => {
    if (!item.filename.toLowerCase().endsWith('.zip')) return null
    const fromName = item.filename.match(FILENAME_PATTERN)
    const fromModified = item.last_modified && dayjs(item.last_modified).isValid() ? dayjs(item.last_modified) : null
    const parsed = fromName ? dayjs(fromName[0], DATE_FORMAT, true) : null
    const backupTime = parsed?.isValid() ? parsed : fromModified
    return { filename: item.filename, backupTime: backupTime ?? null, displayTime: backupTime?.format('YYYY-MM-DD HH:mm') ?? t('settings.modals.backup.history.unknownTime', { defaultValue: 'Unknown time' }), sortValue: backupTime?.valueOf() ?? Number.NEGATIVE_INFINITY }
  }, [t])

  const fetchRows = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const list = await listLocalBackup()
      setRows(list.map(buildRow).filter((row): row is BackupRow => row !== null).sort((a, b) => b.sortValue - a.sortValue || b.filename.localeCompare(a.filename)))
    } catch (error) { setRows([]); showNotice.error(error) } finally { setLoading(false) }
  }, [buildRow, open])
  useEffect(() => { void fetchRows() }, [fetchRows])

  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
  const summary = useMemo(() => rows.length ? t('settings.modals.backup.history.summary', { count: rows.length, recent: rows[0]?.backupTime?.fromNow() ?? rows[0]?.displayTime }) : t('settings.modals.backup.history.empty'), [rows, t])

  const confirmAction = useLockFn(async () => {
    if (!pending) return
    setConfirming(true)
    try {
      if (pending.action === 'delete') {
        await mutate(() => deleteLocalBackup(pending.filename), { id: 'delete-local-backup', errorNotice: false })
        setPending(null); await fetchRows()
      } else {
        setIsRestoring(true)
        await mutate(() => restoreLocalBackup(pending.filename), { id: 'restore-local-backup', errorNotice: false })
        setPending(null); showNotice.success('settings.modals.backup.messages.restoreSuccess'); setIsRestarting(true)
        window.setTimeout(() => { void mutate(() => restartApp(), { id: 'restart-app', errorNotice: false }).catch((error: unknown) => { setIsRestarting(false); showNotice.error(error) }) }, 1000)
      }
    } catch (error) { showNotice.error(error) } finally { setConfirming(false); setIsRestoring(false) }
  })

  const handleExport = useLockFn(async (filename: string) => {
    const savePath = await save({ defaultPath: filename })
    if (!savePath || Array.isArray(savePath)) return
    await mutate(() => exportLocalBackup(filename, savePath), { id: 'export-local-backup', errorNotice: false, successNotice: 'settings.modals.backup.messages.localBackupExported' }).catch(() => showNotice.error('settings.modals.backup.messages.localBackupExportFailed'))
  })

  return <>
    <BaseDialog open={open} title={t('settings.modals.backup.history.title')} contentSx={{ width: 520 }} disableOk cancelBtn={t('shared.actions.close')} onCancel={onClose} onClose={onClose}>
      <Box sx={{ position: 'relative', minHeight: 320 }}><BaseLoadingOverlay isLoading={busy}/><Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{summary}</Typography><IconButton size="small" onClick={() => void fetchRows()} disabled={busy}><RefreshRounded fontSize="small"/></IconButton></Stack>
        <List disablePadding subheader={<ListSubheader disableSticky>{t('settings.modals.backup.history.title')}</ListSubheader>}>{pagedRows.length === 0 ? <ListItem><ListItemText primary={t('settings.modals.backup.history.empty')}/></ListItem> : pagedRows.map((row) => <ListItem key={row.filename} divider><ListItemText primary={<Typography variant="body2" sx={{ wordBreak: 'break-all', fontWeight: 500 }}>{row.filename}</Typography>} secondary={<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="caption" color="text.secondary">{row.displayTime}</Typography><Stack direction="row" spacing={0.5}><IconButton size="small" disabled={busy} onClick={() => void handleExport(row.filename)}><DownloadRounded fontSize="small"/></IconButton><IconButton size="small" disabled={busy} onClick={() => setPending({ action: 'delete', filename: row.filename })}><DeleteOutlined fontSize="small"/></IconButton><IconButton size="small" disabled={busy} onClick={() => setPending({ action: 'restore', filename: row.filename })}><RestoreRounded fontSize="small"/></IconButton></Stack></Stack>}/></ListItem>)}</List>
        {pageCount > 1 && <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}><Typography variant="caption">{currentPage + 1} / {pageCount}</Typography><Button size="small" disabled={busy || currentPage === 0} onClick={() => onPageChange(currentPage - 1)}>{t('shared.actions.previous')}</Button><Button size="small" disabled={busy || currentPage >= pageCount - 1} onClick={() => onPageChange(currentPage + 1)}>{t('shared.actions.next')}</Button></Stack>}
      </Stack></Box>
    </BaseDialog>
    <BaseDialog open={pending !== null} title={pending?.action === 'delete' ? t('settings.modals.backup.actions.deleteBackup') : t('settings.modals.backup.actions.restoreBackup')} okBtn={t('shared.actions.confirm')} cancelBtn={t('shared.actions.cancel')} loading={confirming} onCancel={() => !confirming && setPending(null)} onClose={() => !confirming && setPending(null)} onOk={confirmAction}><Typography variant="body2">{pending?.action === 'delete' ? t('settings.modals.backup.messages.confirmDelete') : t('settings.modals.backup.messages.confirmRestore')}</Typography><Typography variant="caption" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>{pending?.filename}</Typography></BaseDialog>
  </>
}
