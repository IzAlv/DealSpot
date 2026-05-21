import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Loader2, Pencil, Trash2, DollarSign, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, addMonths, subMonths, addDays, isSameDay, isToday, parseISO, isAfter, isBefore } from 'date-fns';
import { EVENT_TYPES } from '../lib/constants';
import { getHolidaysForDate } from '../lib/holidays';
import { CalendarDays as CalIcon } from 'lucide-react';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState({ title: '', date: '', dateTo: '', type: 'other', description: '' });
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      try { const res = await api.get('/api/events'); setEvents(res.data); } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    const fetchUsers = async () => {
      try { const res = await api.get('/api/users'); setUsers(res.data); } catch (err) { console.error(err); }
    };
    fetch();
    fetchUsers();
  }, []);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = start.getDay();
    const padding = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i - 1);
      padding.push({ date: d, isCurrentMonth: false });
    }
    return [...padding, ...days.map(d => ({ date: d, isCurrentMonth: true }))];
  }, [currentDate]);

  const getEventsForDate = (date) => events.filter(e => {
    try {
      const start = parseISO(e.date);
      if (e.dateTo) {
        const end = parseISO(e.dateTo);
        return date >= startOfDay(start) && date <= endOfDay(end);
      }
      return isSameDay(start, date);
    } catch { return false; }
  });
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const openCreateDialog = () => {
    setEditingEvent(null);
    setForm({ title: '', date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'), dateTo: '', type: 'other', description: '' });
    setDialogOpen(true);
  };

  const openEditDialog = (ev) => {
    setEditingEvent(ev);
    let dateStr = '';
    try { dateStr = format(parseISO(ev.date), 'yyyy-MM-dd'); } catch { dateStr = ev.date || ''; }
    setForm({ title: ev.title || '', date: dateStr, dateTo: ev.dateTo || '', type: ev.type || 'other', description: ev.description || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.date) { toast.error('Title and date required'); return; }
    if ((form.type === 'conference' || form.type === 'staff_leave') && !form.dateTo) { toast.error('Date To is required for this type'); return; }
    setSaving(true);
    try {
      if (editingEvent) {
        const res = await api.put(`/api/events/${editingEvent.id}`, form);
        setEvents(events.map(e => e.id === editingEvent.id ? res.data : e));
        toast.success('Event updated');
      } else {
        const res = await api.post('/api/events', form);
        setEvents([...events, res.data]);
        toast.success('Event created');
      }
      setDialogOpen(false);
      setEditingEvent(null);
      setForm({ title: '', date: '', dateTo: '', type: 'other', description: '' });
    } catch (err) { toast.error('Failed to save event'); } finally { setSaving(false); }
  };

  const handleDelete = async (eventId) => {
    try {
      await api.delete(`/api/events/${eventId}`);
      setEvents(events.filter(e => e.id !== eventId));
      toast.success('Event deleted');
      if (editingEvent?.id === eventId) { setDialogOpen(false); setEditingEvent(null); }
    } catch (err) { toast.error('Failed to delete event'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div></div>
        <Button onClick={openCreateDialog} data-testid="calendar-add-event"><Plus className="mr-2 h-4 w-4" />Add Event</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <h2 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy')}</h2>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>)}
                {calendarDays.map(({ date, isCurrentMonth }, i) => {
                  const dayEvents = getEventsForDate(date);
                  const dayHolidays = getHolidaysForDate(date.getFullYear(), date.getMonth(), date.getDate());
                  const selected = selectedDate && isSameDay(date, selectedDate);
                  return (
                    <div
                      key={i}
                      onClick={() => isCurrentMonth && setSelectedDate(date)}
                      className={`p-2 min-h-[80px] transition-colors ${
                        !isCurrentMonth ? 'bg-background' : 'bg-card cursor-pointer hover:bg-muted/30'
                      } ${selected && isCurrentMonth ? 'ring-2 ring-primary ring-inset' : ''} ${isToday(date) ? 'bg-primary/5' : ''} ${dayHolidays.length > 0 && isCurrentMonth ? 'bg-red-50/50' : ''}`}
                    >
                      {isCurrentMonth && (<>
                      <div className={`text-sm font-medium mb-1 ${isToday(date) ? 'text-primary font-bold' : ''}`}>
                        {format(date, 'd')}
                        {dayHolidays.length > 0 && null}
                      </div>
                      {dayHolidays.slice(0, 1).map((h, j) => (
                        <div key={`h-${j}`} className={`text-[10px] px-1 py-0.5 rounded mb-0.5 truncate border flex items-center gap-1 ${h.colorClass}`}><img src={h.flag} alt={h.country} className="h-3 w-4 object-cover rounded-none shrink-0" /> {h.title}</div>
                      ))}
                      {dayEvents.slice(0, dayHolidays.length > 0 ? 1 : 2).map((ev, j) => (
                        <div key={j} className={`text-[10px] px-1 py-0.5 rounded mb-0.5 truncate ${EVENT_TYPES[ev.type]?.color || 'bg-muted text-muted-foreground'}`}>{ev.title}</div>
                      ))}
                      {(dayEvents.length + dayHolidays.length) > 2 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length + dayHolidays.length - 2} more</div>}
                      </>)}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4">
          {/* Selected Date */}
          {selectedDate && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{format(selectedDate, 'EEEE, MMMM d')}</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const holidays = getHolidaysForDate(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                  const hasContent = selectedDateEvents.length > 0 || holidays.length > 0;
                  return hasContent ? (
                    <div className="space-y-2">
                      {holidays.map((h, i) => (
                        <div key={`hol-${i}`} className={`p-2 rounded-lg border text-sm flex items-center gap-2 ${h.colorClass}`}><img src={h.flag} alt={h.country} className="h-4 w-5 object-cover rounded-none shrink-0" /> {h.title}</div>
                      ))}
                      {selectedDateEvents.map(ev => (
                        <div key={ev.id} className={`p-2 rounded-lg border ${EVENT_TYPES[ev.type]?.color || 'bg-muted'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{ev.title}</p>
                              {ev.dateTo && (() => { try { const s = parseISO(ev.date); const e = parseISO(ev.dateTo); if (!isSameDay(s, e)) return <p className="text-xs mt-0.5 opacity-70">({format(s, 'd')}-{format(e, 'd MMMM yyyy')})</p>; } catch {} return null; })()}
                              {ev.description && <p className="text-xs mt-0.5 opacity-60 truncate">{ev.description}</p>}
                            </div>
                            <div className="flex gap-0.5 shrink-0">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(ev)}><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(ev.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No events on this day</p>;
                })()}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Payments */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" />Upcoming Payments</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const now = new Date();
                const twoWeeks = addDays(now, 14);
                const upcoming = events.filter(e => {
                  if (e.type !== 'payment') return false;
                  try { const d = parseISO(e.date); return (isAfter(d, addDays(now, -1)) && isBefore(d, addDays(twoWeeks, 1))); } catch { return false; }
                }).sort((a, b) => { try { return parseISO(a.date) - parseISO(b.date); } catch { return 0; } });
                return upcoming.length === 0 ? <p className="text-sm text-muted-foreground py-2">No upcoming payments</p> : (
                  <div className="space-y-2">
                    {upcoming.map(ev => (
                      <div key={ev.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer border border-green-100 bg-green-50/30" onClick={() => openEditDialog(ev)}>
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{ev.title}</p>{ev.description && <p className="text-xs text-muted-foreground truncate">{ev.description}</p>}</div>
                        <span className="text-xs font-medium text-muted-foreground shrink-0">{(() => { try { return format(parseISO(ev.date), 'dd MMM'); } catch { return ''; } })()}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Upcoming Meetings */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-purple-600" />Upcoming Meetings</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const now = new Date();
                const twoWeeks = addDays(now, 14);
                const upcoming = events.filter(e => {
                  if (e.type !== 'meeting' && e.type !== 'conference') return false;
                  try { const d = parseISO(e.date); return (isAfter(d, addDays(now, -1)) && isBefore(d, addDays(twoWeeks, 1))); } catch { return false; }
                }).sort((a, b) => { try { return parseISO(a.date) - parseISO(b.date); } catch { return 0; } });
                return upcoming.length === 0 ? <p className="text-sm text-muted-foreground py-2">No upcoming meetings</p> : (
                  <div className="space-y-2">
                    {upcoming.map(ev => (
                      <div key={ev.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer border border-purple-100 bg-purple-50/30" onClick={() => openEditDialog(ev)}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ev.type === 'conference' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{ev.title}</p>{ev.description && <p className="text-xs text-muted-foreground truncate">{ev.description}</p>}</div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-medium text-muted-foreground">{(() => { try { return format(parseISO(ev.date), 'dd MMM'); } catch { return ''; } })()}</span>
                          <p className="text-[10px] text-muted-foreground capitalize">{ev.type}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Upcoming Holidays */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-red-500" />Upcoming Holidays</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const now = new Date();
                const holidays = [];
                for (let i = 0; i <= 7; i++) {
                  const d = addDays(now, i);
                  const dayHols = getHolidaysForDate(d.getFullYear(), d.getMonth(), d.getDate());
                  dayHols.forEach(h => holidays.push({ ...h, dateObj: d }));
                }
                return holidays.length === 0 ? <p className="text-sm text-muted-foreground py-2">No holidays in the next 7 days</p> : (
                  <div className="space-y-2">
                    {holidays.map((h, i) => (
                      <div key={i} className={`flex items-center gap-3 py-1.5 px-2 rounded-lg border ${h.colorClass || 'bg-muted/50'}`}>
                        <span className="text-lg shrink-0"><img src={h.flag} alt={h.country} className="h-5 w-6 object-cover rounded-none" /></span>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{h.title}</p><p className="text-xs text-muted-foreground">{({TR:'Turkey',RU:'Russia',UA:'Ukraine',US:'USA'})[h.country] || h.country}</p></div>
                        <span className="text-xs font-medium text-muted-foreground shrink-0">{format(h.dateObj, 'dd MMM')}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-center">{editingEvent ? 'Edit Event' : 'New Event'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({...form, type: v, title: v === 'staff_leave' ? '' : form.title})}>
                <SelectTrigger data-testid="event-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="conference">Conference</SelectItem>
                  <SelectItem value="staff_leave">Staff Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === 'staff_leave' ? (
              <div className="space-y-2"><Label>Staff Name *</Label>
                <Select value={form.title} onValueChange={(v) => setForm({...form, title: v})}>
                  <SelectTrigger data-testid="event-title-input"><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id || u.username} value={u.name || u.username}>{u.name || u.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} data-testid="event-title-input" /></div>
            )}
            {(form.type === 'conference' || form.type === 'staff_leave') ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date From *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalIcon className="mr-2 h-4 w-4" />
                        {form.date ? (() => { try { const [y,m,d] = form.date.split('-'); return `${d}/${m}/${y}`; } catch { return form.date; } })() : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                      <Calendar mode="single" selected={form.date ? parseISO(form.date) : undefined} onSelect={(d) => d && setForm({...form, date: format(d, 'yyyy-MM-dd')})} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2"><Label>Date To *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalIcon className="mr-2 h-4 w-4" />
                        {form.dateTo ? (() => { try { const [y,m,d] = form.dateTo.split('-'); return `${d}/${m}/${y}`; } catch { return form.dateTo; } })() : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                      <Calendar mode="single" selected={form.dateTo ? parseISO(form.dateTo) : undefined} onSelect={(d) => d && setForm({...form, dateTo: format(d, 'yyyy-MM-dd')})} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : (
              <div className="space-y-2"><Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalIcon className="mr-2 h-4 w-4" />
                      {form.date ? (() => { try { const [y,m,d] = form.date.split('-'); return `${d}/${m}/${y}`; } catch { return form.date; } })() : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                    <Calendar mode="single" selected={form.date ? parseISO(form.date) : undefined} onSelect={(d) => d && setForm({...form, date: format(d, 'yyyy-MM-dd')})} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} data-testid="event-description-input" /></div>
          </div>
          <DialogFooter className="flex justify-between">
            {editingEvent && (
              <Button variant="destructive" size="sm" onClick={() => handleDelete(editingEvent.id)} data-testid="event-delete-btn">
                <Trash2 className="h-4 w-4 mr-1" />Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingEvent(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="event-save-btn">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingEvent ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
