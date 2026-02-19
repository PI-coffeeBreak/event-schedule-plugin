import { useState, useEffect } from "react";

/**
 * Lightweight schedule preview component loaded dynamically by the host app.
 * Demonstrates the plugin component pipeline — the full Schedule with
 * FullCalendar stays as a built-in component in event-app for now.
 */
export default function SchedulePreview({ title = "Schedule", description, locale = "en", timeZone = "local" }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    setEvents([
      { id: 1, title: "Opening Keynote", start: "2025-06-01T09:00", end: "2025-06-01T10:00" },
      { id: 2, title: "Workshop A", start: "2025-06-01T10:30", end: "2025-06-01T12:00" },
      { id: 3, title: "Lunch Break", start: "2025-06-01T12:00", end: "2025-06-01T13:00" },
    ]);
  }, []);

  const formatTime = (iso) => {
    const opts = { hour: "2-digit", minute: "2-digit" };
    if (timeZone && timeZone !== "local") opts.timeZone = timeZone;
    return new Date(iso).toLocaleTimeString(locale, opts);
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        {description && <p className="text-base-content/70">{description}</p>}
        <div className="divider my-1" />
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2">
              <span className="badge badge-primary badge-sm">
                {formatTime(ev.start)}
              </span>
              <span className="font-medium">{ev.title}</span>
              <span className="ml-auto text-xs text-base-content/50">
                {formatTime(ev.start)} – {formatTime(ev.end)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
