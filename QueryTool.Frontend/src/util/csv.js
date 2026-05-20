
export function downloadCsv(columns, rows, filename = 'export.csv') {
    const escape = v => {
        if (v == null) return ''
        const s = String(v)
        if (/[";, \n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
    }

    const header = columns.map(escape).join(',')
    const lines = rows.map(r => columns.map(c => escape(r?.[c])).join(','))
    const csv = [header, ...lines].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
