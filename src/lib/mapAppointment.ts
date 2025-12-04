export function mapDbToMobileAppt(a: any) {
  const rawTitle = typeof a.title === 'string' ? a.title : ''
  const isJob = !!a.allDay || /^JOB:\s*/i.test(rawTitle || '') || (!!a.crewId) || (typeof a.squares === 'number' && isFinite(a.squares) && a.squares > 0)
  const customerName = a.lead?.contact?.name || ''
  const contactId = a.lead?.contactId || a.lead?.contact?.id || ''
  const property = a.lead?.property || null
  const addr = property ? [property.address1, property.city, [property.state, property.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
  const workType = a.lead?.title || (isJob ? 'Job' : 'Appointment')
  let title = a.title || 'Untitled'
  if (isJob && typeof title === 'string') {
    title = title.replace(/(\d+\.\d+)(?=\s*sq\b)/gi, (m) => {
      const n = parseFloat(m)
      return isFinite(n) ? n.toFixed(2) : m
    })
  }
  const squares = ((): number | null => {
    const v = (a as any).squares
    if (typeof v === 'number' && isFinite(v) && v > 0) return v
    const mm = typeof a.title === 'string' ? a.title.match(/(\d+(?:\.\d+)?)\s*sq\b/i) : null
    if (mm) {
      const n = parseFloat(mm[1])
      if (isFinite(n) && n > 0) return n
    }
    return null
  })()
  function parseCategoriesFromTitle(title: string) {
    const t = (title || '').toLowerCase()
    const cats: string[] = []
    if (/roof/i.test(t)) cats.push('Roofing')
    if (/siding/i.test(t)) cats.push('Siding')
    if (/deck/i.test(t)) cats.push('Decking')
    if (/(window|door)/i.test(t)) cats.push('Windows and Doors')
    return Array.from(new Set(cats))
  }
  const categories = parseCategoriesFromTitle(rawTitle)
  const lat = property?.lat ?? null
  const lng = property?.lng ?? null
  const leadNotes = a.lead?.notes || ''
  const contact = a.lead?.contact ? { id: a.lead.contact.id, name: a.lead.contact.name, email: a.lead.contact.email || '', phone: a.lead.contact.phone || '' } : null

  return {
    id: a.id,
    title,
    type: isJob ? 'install' : 'other',
    when: new Date(a.start).toISOString(),
    end: a.end ? new Date(a.end).toISOString() : undefined,
    allDay: !!a.allDay,
    location: addr,
    notes: a.description || '',
    customerId: a.leadId || '',
    contactId,
  assignedTo: a.user?.email || '', // legacy email identifier (field app filter)
  userName: a.user?.name || '', // direct user name for display
  assignedName: a.user?.name || '', // alias for convenience in consumers
  userColor: a.user?.calendarColor || '', // dark color for calendar event styling
    job: isJob,
    customerName,
    address: addr,
    lat,
    lng,
    leadNotes,
    contact,
    workType,
    crewId: a.crewId || '',
    jobStatus: a.jobStatus || (isJob ? 'scheduled' : ''),
    materialOrdered: !!a.materialOrdered,
    squares,
    extrasJson: a.extrasJson || '[]',
    attachmentsJson: a.attachmentsJson || '[]',
    completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : undefined,
    assignees: Array.isArray(a.assignees) ? a.assignees.map((x: any) => ({ id: x.userId, email: x.user?.email, name: x.user?.name, role: x.role })) : [],
    crews: Array.isArray(a.crews) ? a.crews.map((c: any) => ({ id: c.crewId, scopeId: c.scopeId })) : [],
    scopes: Array.isArray(a.scopes) ? a.scopes.map((s: any) => ({ id: s.id, category: s.category, title: s.title, assignedCrewId: s.assignedCrewId })) : [],
    categories,
  }
}
