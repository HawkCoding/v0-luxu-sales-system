import type { AuditLog } from "./types"

export function exportAuditToText(auditLogs: AuditLog[], jobNumber: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const lines: string[] = []
  
  lines.push(`AUDIT TRAIL EXPORT`)
  lines.push(`Job Number: ${jobNumber}`)
  lines.push(`Export Date: ${new Date().toLocaleString()}`)
  lines.push(`Total Entries: ${auditLogs.length}`)
  lines.push(``)
  lines.push(`${'='.repeat(80)}`)
  lines.push(``)
  
  if (auditLogs.length === 0) {
    lines.push(`No audit entries found for this job.`)
  } else {
    auditLogs.forEach((log, index) => {
      lines.push(`Entry #${index + 1}`)
      lines.push(`-`.repeat(40))
      lines.push(`Timestamp: ${new Date(log.createdAt).toLocaleString()}`)
      lines.push(`Actor: ${log.actor}`)
      lines.push(`Action: ${log.action}`)
      lines.push(`Entity: ${log.entityType} (ID: ${log.entityId})`)
      
      if (log.beforeJson) {
        lines.push(``)
        lines.push(`Before State:`)
        try {
          const before = JSON.parse(log.beforeJson)
          lines.push(JSON.stringify(before, null, 2))
        } catch {
          lines.push(log.beforeJson)
        }
      }
      
      if (log.afterJson) {
        lines.push(``)
        lines.push(`After State:`)
        try {
          const after = JSON.parse(log.afterJson)
          lines.push(JSON.stringify(after, null, 2))
        } catch {
          lines.push(log.afterJson)
        }
      }
      
      if (log.metaJson) {
        lines.push(``)
        lines.push(`Metadata:`)
        try {
          const meta = JSON.parse(log.metaJson)
          lines.push(JSON.stringify(meta, null, 2))
        } catch {
          lines.push(log.metaJson)
        }
      }
      
      lines.push(``)
      lines.push(``)
    })
  }
  
  lines.push(`${'='.repeat(80)}`)
  lines.push(`End of Audit Trail`)
  
  return lines.join('\n')
}

export function downloadAuditLog(auditLogs: AuditLog[], jobNumber: string) {
  const content = exportAuditToText(auditLogs, jobNumber)
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-${jobNumber}-${Date.now()}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
