import React, { useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Stethoscope } from 'lucide-react';
import { Btn, COLORS, EmptyState, SectionHeader, SpineDivider, iconBtnStyle, todayISO } from '../theme';
import { CalendarDays } from 'lucide-react';

const DISCIPLINE_LABEL = { gp: 'GP', biokineticist: 'Biokineticist' };
const DisciplineIcon = { gp: Stethoscope, biokineticist: Activity };
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

// Day view opens with slots from 05:00 to 20:00 in 30-minute increments.
const DAY_START_MIN = 5 * 60;
const DAY_END_MIN = 20 * 60;
const SLOT_MINUTES = 30;

const minutesToTime = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const timeToMinutes = (t) => {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

function buildDaySlots() {
  const slots = [];
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SLOT_MINUTES) slots.push(m);
  return slots;
}
const DAY_SLOTS = buildDaySlots();

export default function CalendarView({ appointments, clients, practitioners, onEdit, onNew }) {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(today);

  const apptsByDate = useMemo(() => {
    const map = {};
    (appointments || []).forEach((a) => {
      map[a.date] = map[a.date] || [];
      map[a.date].push(a);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
    return map;
  }, [appointments]);

  const clientById = useMemo(() => {
    const map = {};
    (clients || []).forEach((c) => { map[c.id] = c; });
    return map;
  }, [clients]);

  const isWmpAppt = (a) => !!clientById[a.client_id]?.is_wmp;

  const { year, month } = cursor;
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [firstWeekday, daysInMonth]);

  const goMonth = (delta) => {
    setCursor((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { year: y, month: m };
    });
  };

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(today);
  };

  const selectedAppts = apptsByDate[selectedDate] || [];
  const selectedLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

  // Map each 30-min slot (05:00–20:00) to the appointment occupying it, if any.
  const slotMap = useMemo(() => {
    const map = {};
    selectedAppts.forEach((a) => {
      const start = timeToMinutes(a.time);
      if (start == null) return;
      const end = start + (Number(a.duration_minutes) || SLOT_MINUTES);
      DAY_SLOTS.forEach((slotStart) => {
        const slotEnd = slotStart + SLOT_MINUTES;
        if (start < slotEnd && end > slotStart) {
          // The slot containing the appointment's actual start time renders the
          // full card; later slots it spans are just marked busy (not bookable).
          const isStart = start >= slotStart && start < slotEnd;
          if (!map[slotStart] || isStart) map[slotStart] = { appt: a, isStart };
        }
      });
    });
    return map;
  }, [selectedAppts]);

  return (
    <div>
      <SectionHeader action={<Btn onClick={() => onNew?.()}><Plus size={16} />New booking</Btn>}>Calendar</SectionHeader>
      <SpineDivider />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => goMonth(-1)} style={iconBtnStyle}><ChevronLeft size={14} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'Newsreader, serif', fontSize: 18, color: COLORS.ink }}>{monthLabel}</div>
          {(cursor.year !== new Date().getFullYear() || cursor.month !== new Date().getMonth()) && (
            <button onClick={goToday} style={{ background: 'none', border: 'none', color: COLORS.teal, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Today</button>
          )}
        </div>
        <button onClick={() => goMonth(1)} style={iconBtnStyle}><ChevronRight size={14} /></button>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 12, color: COLORS.slate }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.wmpGreen, display: 'inline-block' }} /> WMP patient
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.calendarBlue, display: 'inline-block' }} /> Other patient
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 18 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const iso = isoOf(year, month, day);
          const dayAppts = apptsByDate[iso] || [];
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const dots = dayAppts.slice(0, 4);
          const extra = dayAppts.length - dots.length;
          return (
            <button
              key={iso}
              onClick={() => setSelectedDate(iso)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '6px 2px 8px',
                borderRadius: 10,
                border: `1px solid ${isSelected ? COLORS.teal : COLORS.line}`,
                background: isSelected ? COLORS.paperRaised : isToday ? '#EEF3F0' : COLORS.paperRaised,
                cursor: 'pointer',
                minHeight: 52,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isSelected ? COLORS.tealDeep : COLORS.ink }}>{day}</span>
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', minHeight: 6 }}>
                {dots.map((a) => (
                  <span
                    key={a.id}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: isWmpAppt(a) ? COLORS.wmpGreen : COLORS.calendarBlue, display: 'inline-block' }}
                  />
                ))}
                {extra > 0 && <span style={{ fontSize: 9, color: COLORS.slate, fontWeight: 700 }}>+{extra}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal, textTransform: 'uppercase', letterSpacing: 0.6 }}>{selectedLabel}</div>
        <div style={{ fontSize: 11, color: COLORS.slate }}>05:00 – 20:00</div>
      </div>

      {selectedAppts.length === 0 && (
        <div style={{ marginBottom: 10 }}>
          <EmptyState icon={CalendarDays} title="Nothing booked" sub="Tap a time slot below to book it." />
        </div>
      )}

      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: 'hidden', background: COLORS.paperRaised }}>
        {DAY_SLOTS.map((slotStart, i) => {
          const label = minutesToTime(slotStart);
          const occ = slotMap[slotStart];
          const borderTop = i === 0 ? 'none' : `1px solid ${COLORS.line}`;

          if (!occ) {
            // Free slot — click to start a new booking pre-filled at this time.
            return (
              <button
                key={slotStart}
                onClick={() => onNew?.(selectedDate, label)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  background: 'none',
                  border: 'none',
                  borderTop,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.slate, width: 46, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, color: COLORS.line, flex: 1, borderTop: `1px dashed ${COLORS.line}` }} />
                <Plus size={13} color={COLORS.teal} />
              </button>
            );
          }

          if (!occ.isStart) {
            // A later slot spanned by an appointment that started earlier — busy, not clickable.
            return (
              <div key={slotStart} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px', borderTop, background: '#FAFAF8' }}>
                <span style={{ fontSize: 11, color: COLORS.line, width: 46, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 11, color: COLORS.line }}>·</span>
              </div>
            );
          }

          const a = occ.appt;
          const client = clientById[a.client_id];
          const practitioner = practitioners?.find((p) => p.id === a.practitioner_id);
          const DIcon = practitioner ? DisciplineIcon[practitioner.discipline] : null;
          const wmp = isWmpAppt(a);
          return (
            <div key={slotStart} style={{ borderTop, borderLeft: `4px solid ${wmp ? COLORS.wmpGreen : COLORS.calendarBlue}`, padding: '10px 12px 10px 10px', background: '#FBFCFB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>{client?.name || 'Unknown patient'}{wmp ? ' · WMP' : ''}</div>
                  <div style={{ fontSize: 12, color: COLORS.slate, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Clock size={12} /> {a.time?.slice(0, 5)} · {a.duration_minutes}min · {a.session_type}
                  </div>
                  {practitioner && (
                    <div style={{ fontSize: 11, color: COLORS.tealDeep, display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      {DIcon && <DIcon size={11} />} {practitioner.name} · {DISCIPLINE_LABEL[practitioner.discipline]}
                    </div>
                  )}
                </div>
                <button onClick={() => onEdit?.(a)} style={{ ...iconBtnStyle, padding: '4px 8px' }}><Pencil size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
