import PropTypes from "prop-types";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { registerPluginTranslations } from "coffeebreak";
import en from "../locales/en.json";
import ptBR from "../locales/pt-BR.json";
import ptPT from "../locales/pt-PT.json";
import { getApi } from "coffeebreak/event-app";

const NS = "event-schedule-plugin";
registerPluginTranslations(NS, { en, "pt-BR": ptBR, "pt-PT": ptPT });

const ActivityContext = createContext({ activities: [], loading: true, error: null, types: [] });

function utcToLocalDatetimeLocal(utcISOString) {
  if (!utcISOString) return "";
  const utcDate = new Date(utcISOString);
  if (isNaN(utcDate.getTime())) return "";
  const tzOffset = utcDate.getTimezoneOffset();
  const localDate = new Date(utcDate.getTime() - tzOffset * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    localDate.getFullYear() +
    "-" + pad(localDate.getMonth() + 1) +
    "-" + pad(localDate.getDate()) +
    "T" + pad(localDate.getHours()) +
    ":" + pad(localDate.getMinutes())
  );
}

const getDefaultGroupingSettings = () => ({
  enable_grouping: true,
  time_threshold: 15,
  min_group_size: 2,
  duration_variance: 0.5,
  group_by_type: true,
});

async function fetchScheduleSettings() {
  try {
    const api = getApi();
    const response = await api.get("/ui/plugin-config/event-schedule-plugin");
    const schema = response.data;
    if (schema && schema.inputs && Array.isArray(schema.inputs)) {
      const settings = {};
      schema.inputs.forEach((input) => {
        if (input.default !== undefined) settings[input.name] = input.default;
      });
      return {
        enable_grouping: settings.enable_grouping ?? true,
        time_threshold: settings.time_threshold ?? 15,
        min_group_size: settings.min_group_size ?? 2,
        duration_variance: settings.duration_variance ?? 0.5,
        group_by_type: settings.group_by_type ?? true,
      };
    }
    return getDefaultGroupingSettings();
  } catch {
    return getDefaultGroupingSettings();
  }
}

function canGroupActivities(activity1, activity2, settings, types) {
  const { time_threshold = 15, duration_variance = 0.5, group_by_type = true } = settings;
  const type1 = types?.find((item) => item.id === activity1.type_id);
  const type2 = types?.find((item) => item.id === activity2.type_id);
  if (type1?.grouping?.canGroup === false || type2?.grouping?.canGroup === false) return false;
  if (group_by_type && activity1.type_id !== activity2.type_id) return false;
  const time1 = new Date(activity1.date).getTime();
  const time2 = new Date(activity2.date).getTime();
  const duration1 = activity1.duration || 30;
  const duration2 = activity2.duration || 30;
  const end1 = time1 + duration1 * 60000;
  const end2 = time2 + duration2 * 60000;
  const isConsecutive =
    Math.abs(end1 - time2) <= 5 * 60000 || Math.abs(end2 - time1) <= 5 * 60000;
  if (isConsecutive) return true;
  if (Math.abs(time1 - time2) / (1000 * 60) > time_threshold) return false;
  const durationDiff = Math.abs(duration1 - duration2);
  const maxDuration = Math.max(duration1, duration2);
  return durationDiff / maxDuration <= duration_variance;
}

function smartGroupActivities(activities, types, settings) {
  const { enable_grouping = true, min_group_size = 2 } = settings || {};
  if (!enable_grouping) return { groups: [], standalone: [...activities] };
  const sorted = [...activities].sort((a, b) => new Date(a.date) - new Date(b.date));
  const groups = [];
  const processed = new Set();
  const standalone = [];
  sorted.forEach((activity, index) => {
    if (processed.has(activity.id)) return;
    const type = types?.find((item) => item.id === activity.type_id);
    if (type?.grouping?.canGroup === false) {
      standalone.push(activity);
      processed.add(activity.id);
      return;
    }
    const group = [activity];
    processed.add(activity.id);
    for (let i = index + 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (processed.has(candidate.id)) continue;
      if (group.some((ga) => canGroupActivities(ga, candidate, settings, types))) {
        group.push(candidate);
        processed.add(candidate.id);
      }
    }
    if (group.length >= min_group_size) {
      groups.push(group);
    } else {
      group.forEach((act) => { standalone.push(act); processed.delete(act.id); });
    }
  });
  return { groups, standalone };
}

function getGroupMetadata(group) {
  if (!group || group.length === 0) return null;
  const startTimes = group.map((a) => new Date(a.date));
  const endTimes = group.map((a) => new Date(new Date(a.date).getTime() + (a.duration || 30) * 60000));
  const earliestStart = new Date(Math.min(...startTimes));
  const latestEnd = new Date(Math.max(...endTimes));
  return {
    count: group.length,
    startTime: earliestStart,
    endTime: latestEnd,
    rooms: [...new Set(group.map((a) => a.room).filter(Boolean))],
    typeCount: [...new Set(group.map((a) => a.type_id))].length,
    duration: (latestEnd - earliestStart) / (1000 * 60),
  };
}

const TOOLBAR_BUTTON_GROUPS = {
  NAV_PREV_NEXT: "prev,next",
  NAV_PREV_NEXT_TODAY: "prev,next today",
  TITLE_ONLY: "title",
  VIEW_MONTH: "dayGridMonth",
  VIEW_WEEK_DAY: "dayGridWeek,dayGridDay",
  VIEW_TIMEGRID_WEEK_DAY: "timeGridWeek,timeGridDay",
  VIEW_TODAY: "timeGridDay",
  VIEW_DAY_WEEK: "timeGridWeek",
  VIEW_TIMEGRID_DAY_WEEK: "timeGridDay,timeGridWeek",
  VIEW_LIST_DAY_WEEK: "listDay,listWeek",
  VIEW_ALL_SHORT: "timeGridDay,timeGridWeek,listDay",
  EMPTY: "",
  MOBILE_VIEWS: "listWeek,timeGridDay",
  DESKTOP_VIEWS: "timeGridDay,timeGridWeek,listWeek",
};

const CALENDAR_VIEWS = {
  DAYGRIDWEEK: "dayGridWeek",
  DAYGRIDDAY: "dayGridDay",
  TIMEGRIDWEEK: "timeGridWeek",
  TIMEGRIDDAY: "timeGridDay",
  LISTWEEK: "listWeek",
  LISTDAY: "listDay",
  LISTYEAR: "listYear",
};

const WEEKDAY = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const EventModal = ({ event, onClose }) => {
  const modalRef = useRef(null);
  const { title, start, extendedProps = {} } = event;
  const { topic = "", speaker = "", description = "", location = "" } =
    extendedProps;

  useEffect(() => {
    modalRef.current?.showModal();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <dialog ref={modalRef} className="modal modal-middle" onClose={onClose}>
      <div className="modal-box">
        <h3
          className="font-bold text-lg text-primary"
          dangerouslySetInnerHTML={{ __html: title }}
        ></h3>
        <p className="text-sm opacity-75 mt-1 mb-3">
          {start.toLocaleString(navigator.language, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>

        {topic && (
          <p
            className="text-base font-medium my-1"
            dangerouslySetInnerHTML={{ __html: topic }}
          ></p>
        )}
        {speaker && (
          <p className="my-1">
            <span className="font-medium">Speaker:</span>{" "}
            <span dangerouslySetInnerHTML={{ __html: speaker }}></span>
          </p>
        )}
        {location && (
          <p className="my-1">
            <span className="font-medium">Location:</span>{" "}
            <span dangerouslySetInnerHTML={{ __html: location }}></span>
          </p>
        )}

        {description && (
          <>
            <div className="divider my-2"></div>
            <div className="prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: description }} />
            </div>
          </>
        )}

        <div className="modal-action flex flex-row gap-2 mt-4 justify-end">
          <button
            className="btn btn-secondary rounded-xl mr-auto"
            onClick={() => window.location.assign(`/activity/${event.id}`)}
          >
            View Activity Details
          </button>
          <form method="dialog">
            <button className="btn btn-primary rounded-xl">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};

const GroupedActivityModal = ({ event, onClose }) => {
  const modalRef = useRef(null);
  const { title, start, extendedProps = {} } = event;
  const { groupedActivities = [] } = extendedProps;

  useEffect(() => {
    modalRef.current?.showModal();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(navigator.language, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDuration = (duration) => {
    if (!duration) {
      return "";
    }
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  return (
    <dialog ref={modalRef} className="modal modal-middle" onClose={onClose}>
      <div className="modal-box max-w-4xl max-h-[85vh] p-0">
        <div className="sticky top-0 bg-base-100 z-10 px-4 sm:px-6 py-3 sm:py-4 border-b border-base-300">
          <h3
            className="text-lg sm:text-xl font-bold text-primary mb-1"
            dangerouslySetInnerHTML={{ __html: title }}
          ></h3>
          <p className="text-xs sm:text-sm opacity-70">
            {start.toLocaleString(navigator.language, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 overflow-y-auto max-h-[calc(85vh-180px)]">
          <div className="space-y-1">
            {groupedActivities.map((activity) => (
              <div
                key={activity.id}
                className="group relative pl-3 pr-2 py-2 sm:py-3 rounded-lg hover:bg-base-200 transition-all duration-200 cursor-pointer border-l-4 border-transparent hover:border-primary"
                onClick={() => window.location.assign(`/activity/${activity.id}`)}
              >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="flex items-start gap-2 sm:gap-4">
                  <div className="flex-shrink-0 text-center w-10 sm:w-14">
                    <div className="text-xs sm:text-sm font-bold text-primary">
                      {formatTime(activity.date)}
                    </div>
                    {activity.duration && (
                      <div className="text-xs opacity-60">
                        {formatDuration(activity.duration)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4
                      className="font-semibold text-sm sm:text-base mb-1 group-hover:text-primary transition-colors leading-tight"
                      dangerouslySetInnerHTML={{ __html: activity.name }}
                    ></h4>

                    {activity.room && (
                      <div className="flex items-center gap-1 text-xs sm:text-sm opacity-70 mb-1">
                        <svg
                          className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span
                          className="truncate"
                          dangerouslySetInnerHTML={{ __html: activity.room }}
                        ></span>
                      </div>
                    )}

                    {activity.topic && (
                      <p
                        className="text-xs sm:text-sm opacity-80 mb-1 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: activity.topic }}
                      ></p>
                    )}

                    <div className="flex flex-wrap gap-1 sm:gap-2 mt-1">
                      {activity.speaker && (
                        <div className="badge badge-outline badge-sm gap-1 text-xs">
                          <svg
                            className="w-3 h-3 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          <span
                            className="truncate max-w-xs sm:max-w-none"
                            dangerouslySetInnerHTML={{ __html: activity.speaker }}
                          ></span>
                        </div>
                      )}
                      {activity.moderator && (
                        <div className="badge badge-outline badge-sm gap-1 text-xs">
                          <svg
                            className="w-3 h-3 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span
                            className="truncate max-w-xs sm:max-w-none"
                            dangerouslySetInnerHTML={{ __html: activity.moderator }}
                          ></span>
                        </div>
                      )}
                      {activity.discussant && (
                        <div className="badge badge-outline badge-sm gap-1 text-xs">
                          <svg
                            className="w-3 h-3 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                          <span
                            className="truncate max-w-xs sm:max-w-none"
                            dangerouslySetInnerHTML={{ __html: activity.discussant }}
                          ></span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      className="w-5 h-5 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 bg-base-100 border-t border-base-300 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm opacity-70">
              {groupedActivities.length}{" "}
              {groupedActivities.length === 1 ? "session" : "sessions"}
            </p>
            <form method="dialog">
              <button className="btn btn-primary btn-sm rounded-lg">Close</button>
            </form>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};

function ScheduleComponent({
  title = "",
  description = "",
  showFooterToolbar = false,
  firstDay = WEEKDAY.MONDAY,
  weekends = true,
  hiddenDays = [],
  slotDuration = "00:15:00",
  slotMinTime = "00:00:00",
  slotMaxTime = "24:00:00",
  allDaySlot = false,
  eventColor = "var(--color-primary)",
  eventBorderColor = "var(--color-primary)",
  eventTextColor = "var(--color-primary-content)",
  nowIndicator = true,
  expandRows = true,
  locale = "en",
  timeZone = "local",
  navLinks = true,
  eventTimeFormat = {
    hour: "numeric",
    minute: "2-digit",
    meridiem: false,
    hour12: false,
  },
  slotLabelFormat = {
    hour: "numeric",
    minute: "2-digit",
    meridiem: false,
    hour12: false,
  },
  responsiveThreshold = 768,
}) {
  const { t } = useTranslation(NS);
  const { activities, loading, error, types } = useContext(ActivityContext);
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentView, setCurrentView] = useState(() =>
    window.innerWidth < responsiveThreshold
      ? CALENDAR_VIEWS.TIMEGRIDDAY
      : CALENDAR_VIEWS.TIMEGRIDWEEK
  );
  const [groupingSettings, setGroupingSettings] = useState(null);
  const calendarRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await fetchScheduleSettings();
      setGroupingSettings(settings);
    };
    loadSettings();
  }, []);

  const processedActivities = useMemo(() => {
    if (!activities.length || !groupingSettings || !types.length) {
      return activities;
    }

    if (!groupingSettings.enable_grouping) {
      return activities;
    }

    const { groups, standalone } = smartGroupActivities(
      activities,
      types,
      groupingSettings
    );

    const groupedActivities = groups.map((group, index) => {
      const metadata = getGroupMetadata(group);
      const activityType = types.find((type) => type.id === group[0].type_id);
      const typeName = activityType?.type || "Sessions";
      return {
        id: `group-${index}`,
        name: `${typeName} (${metadata.count})`,
        description: `Group of ${metadata.count} parallel activities`,
        date: metadata.startTime.toISOString(),
        duration: metadata.duration,
        type_id: group[0].type_id,
        isGroup: true,
        groupedActivities: group,
      };
    });

    return [...groupedActivities, ...standalone];
  }, [activities, types, groupingSettings]);

  const mapEventsFromActivities = () => {
    return processedActivities.map((activity) => {
      const type = types && types.find((entry) => entry.id === activity.type_id);
      const startDate = utcToLocalDatetimeLocal(activity.date);
      const endDate = utcToLocalDatetimeLocal(
        new Date(new Date(activity.date).getTime() + activity.duration * 60000).toISOString()
      );

      return {
        id: activity.id,
        title: activity.name,
        start: startDate,
        end: endDate,
        color: type?.color || eventColor,
        borderColor: type?.color || eventBorderColor,
        textColor: activity.textColor || eventTextColor,
        allDay: activity.allDay || false,
        extendedProps: {
          description: activity.description,
          speaker: activity.speaker,
          topic: activity.topic,
          location: activity.location,
          room: activity.room,
          isGroup: activity.isGroup || false,
          groupedActivities: activity.groupedActivities || [],
        },
      };
    });
  };

  const getValidRange = () => {
    if (processedActivities.length === 0) {
      return undefined;
    }

    return {
      start: utcToLocalDatetimeLocal(
        new Date(Math.min(...processedActivities.map((activity) => new Date(activity.date)))).toISOString()
      ),
      end: utcToLocalDatetimeLocal(
        new Date(
          Math.max(
            ...processedActivities.map((activity) => {
              const endDate = new Date(activity.date);
              endDate.setMinutes(endDate.getMinutes() + activity.duration);
              return endDate;
            })
          )
        ).toISOString()
      ),
    };
  };

  const getTimeRanges = () => {
    let min = slotMinTime;
    let max = slotMaxTime;

    if (processedActivities.length === 0) {
      return { min, max };
    }

    const activityTimes = processedActivities.map((activity) => {
      const startDate = new Date(utcToLocalDatetimeLocal(activity.date));
      const startHour = startDate.getHours();

      const endDate = new Date(
        utcToLocalDatetimeLocal(
          new Date(new Date(activity.date).getTime() + activity.duration * 60000).toISOString()
        )
      );
      const endMinute = endDate.getMinutes();
      const endHour = endDate.getHours();

      return {
        startHour,
        endHour: endMinute > 0 ? endHour + 1 : endHour,
      };
    });

    const earliestHour = Math.max(
      0,
      Math.min(...activityTimes.map((entry) => entry.startHour))
    );
    const latestHour = Math.min(
      24,
      Math.max(...activityTimes.map((entry) => entry.endHour))
    );

    return {
      min: `${String(earliestHour).padStart(2, "0")}:00:00`,
      max: `${String(latestHour).padStart(2, "0")}:00:00`,
    };
  };

  const getOptimalSlotDuration = () => {
    if (processedActivities.length === 0) {
      return slotDuration;
    }

    const minDuration = Math.min(
      ...processedActivities.map((activity) => activity.duration)
    );

    let roundedDuration;
    if (minDuration <= 5) {
      roundedDuration = 5;
    } else if (minDuration <= 10) {
      roundedDuration = 10;
    } else if (minDuration <= 15) {
      roundedDuration = 15;
    } else if (minDuration <= 30) {
      roundedDuration = 30;
    } else {
      roundedDuration = Math.ceil(minDuration / 60) * 60;
    }

    const hours = Math.floor(roundedDuration / 60);
    const minutes = roundedDuration % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  const renderEventContent = (arg) => {
    if (isMobile) {
      return (
        <div className="w-full px-1">
          {arg.timeText && <div className="text-xs font-bold">{arg.timeText}</div>}
          <div
            className="font-medium text-sm"
            dangerouslySetInnerHTML={{ __html: arg.event.title }}
          ></div>
          {arg.event.extendedProps.room && (
            <div
              className="text-xs opacity-70"
              dangerouslySetInnerHTML={{ __html: arg.event.extendedProps.room }}
            ></div>
          )}
        </div>
      );
    }

    return (
      <div className="px-1 py-0.5 w-full">
        {arg.timeText && <div className="text-xs font-bold">{arg.timeText}</div>}
        <div
          className="font-medium text-sm leading-tight"
          dangerouslySetInnerHTML={{ __html: arg.event.title }}
        ></div>
        {arg.event.extendedProps.room && (
          <div
            className="text-xs opacity-70"
            dangerouslySetInnerHTML={{ __html: arg.event.extendedProps.room }}
          ></div>
        )}
        {arg.event.extendedProps.speaker && (
          <div
            className="text-xs mt-0.5"
            dangerouslySetInnerHTML={{ __html: arg.event.extendedProps.speaker }}
          ></div>
        )}
        {arg.event.extendedProps.location && (
          <div
            className="text-xs italic"
            dangerouslySetInnerHTML={{ __html: arg.event.extendedProps.location }}
          ></div>
        )}
      </div>
    );
  };

  const handleEventClick = (info) => {
    setSelectedEvent(info.event);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < responsiveThreshold);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, [responsiveThreshold]);

  useEffect(() => {
    const viewToUse =
      window.innerWidth < responsiveThreshold
        ? CALENDAR_VIEWS.TIMEGRIDDAY
        : CALENDAR_VIEWS.TIMEGRIDWEEK;

    setCurrentView(viewToUse);

    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.changeView(viewToUse);
    }
  }, [isMobile, responsiveThreshold]);

  if (loading) {
    return (
      <div className="bg-base-100 rounded-lg shadow-md overflow-hidden p-8">
        <div className="loading loading-spinner text-primary mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-base-100 rounded-lg shadow-md overflow-hidden">
        <div className="alert alert-error m-4">{error}</div>
      </div>
    );
  }

  const initialView =
    currentView ||
    (isMobile ? CALENDAR_VIEWS.TIMEGRIDDAY : CALENDAR_VIEWS.TIMEGRIDWEEK);
  const events = mapEventsFromActivities();
  const { min: dynamicSlotMinTime, max: dynamicSlotMaxTime } = getTimeRanges();
  const dynamicSlotDuration = getOptimalSlotDuration();
  const validRange = getValidRange();

  const responsiveHeaderToolbar = isMobile
    ? {
        left: TOOLBAR_BUTTON_GROUPS.NAV_PREV_NEXT,
        center: TOOLBAR_BUTTON_GROUPS.TITLE_ONLY,
        right: TOOLBAR_BUTTON_GROUPS.MOBILE_VIEWS,
      }
    : {
        left: t("schedule.calendar.header.left"),
        center: t("schedule.calendar.header.center"),
        right: t("schedule.calendar.header.right"),
      };

  const responsiveFooterToolbar = isMobile
    ? {
        left: TOOLBAR_BUTTON_GROUPS.EMPTY,
        center: TOOLBAR_BUTTON_GROUPS.EMPTY,
        right: TOOLBAR_BUTTON_GROUPS.EMPTY,
      }
    : {
        left: TOOLBAR_BUTTON_GROUPS.EMPTY,
        center: TOOLBAR_BUTTON_GROUPS.EMPTY,
        right: TOOLBAR_BUTTON_GROUPS.VIEW_ALL_SHORT,
      };

  const mobileButtonText = {
    today: t("schedule.calendar.buttonText.today"),
    month: t("schedule.calendar.buttonText.month"),
    week: t("schedule.calendar.buttonText.week"),
    day: t("schedule.calendar.buttonText.day"),
    list: t("schedule.calendar.buttonText.list"),
    timeGridDay: t("schedule.calendar.buttonText.day"),
    timeGridWeek: t("schedule.calendar.buttonText.week"),
    dayGridMonth: t("schedule.calendar.buttonText.month"),
    dayGridDay: t("schedule.calendar.buttonText.day"),
    listDay: t("schedule.calendar.buttonText.list"),
    listWeek: t("schedule.calendar.buttonText.list"),
  };

  const desktopButtonText = {
    today: t("schedule.calendar.buttonText.today"),
    month: t("schedule.calendar.buttonText.month"),
    week: t("schedule.calendar.buttonText.week"),
    day: t("schedule.calendar.buttonText.day"),
    list: t("schedule.calendar.buttonText.list"),
    timeGridDay: t("schedule.calendar.buttonText.day"),
    timeGridWeek: t("schedule.calendar.buttonText.week"),
    dayGridMonth: t("schedule.calendar.buttonText.month"),
    dayGridDay: t("schedule.calendar.buttonText.day"),
    listDay: t("schedule.calendar.buttonText.list"),
    listWeek: t("schedule.calendar.buttonText.list"),
  };

  const defaultButtonText = isMobile ? mobileButtonText : desktopButtonText;

  const translatedLocale = t("schedule.calendar.locale");
  const calendarLocale =
    translatedLocale && translatedLocale !== "schedule.calendar.locale"
      ? translatedLocale
      : locale;

  const responsiveViews = {
    dayGridWeek: {
      dayMaxEventRows: isMobile ? 2 : 4,
      titleFormat: { month: "short", day: "2-digit" },
    },
    timeGridWeek: {
      dayMaxEventRows: isMobile ? 1 : null,
      slotDuration: "00:15:00",
      slotLabelInterval: "00:30:00",
      allDaySlot: false,
      nowIndicator: true,
    },
    dayGridDay: {
      dayMaxEventRows: isMobile ? 10 : 15,
    },
    timeGridDay: {
      dayMaxEventRows: null,
      allDaySlot: false,
      nowIndicator: true,
      slotDuration: "00:15:00",
      slotLabelInterval: "00:30:00",
    },
    listDay: {
      listDayFormat: { weekday: "long" },
      listDaySideFormat: { month: "long", day: "numeric", year: "numeric" },
    },
    listWeek: {
      listDayFormat: { weekday: "short" },
      listDaySideFormat: { month: "short", day: "numeric" },
    },
    listMonth: {
      listDayFormat: { weekday: "short" },
      listDaySideFormat: { day: "numeric" },
    },
  };

  const titleFormat = isMobile
    ? { month: "short", day: "numeric" }
    : { month: "long", year: "numeric", day: "numeric" };

  return (
    <div className="bg-base-100 overflow-hidden">
      {(title || description) && (
        <div className="p-4 border-b border-base-300">
          {title && <h2 className="text-2xl text-primary font-bold">{t("schedule.title")}</h2>}
          {description && <p className="text-base-content/70 mt-1">{description}</p>}
        </div>
      )}

      <div className={`p-4 ${isMobile ? "calendar-mobile" : ""}`}>
        <style>{`
          .calendar-mobile .fc-button {
            padding: 0.3em 0.5em;
            font-size: 0.9em;
          }
          .calendar-mobile .fc-toolbar-title {
            font-size: 1.2em;
          }
          .calendar-mobile .fc-list-event-time {
            width: 6em;
          }

          .fc .fc-button-primary {
            background-color: var(--color-primary);
            border-color: var(--color-primary);
            color: var(--color-primary-content);
            transition: all 0.2s ease;
          }

          .fc .fc-button-primary:not(:disabled):hover {
            background-color: var(--color-primary);
            border-color: var(--color-primary);
            filter: brightness(0.95);
          }

          .fc .fc-button-primary:not(:disabled).fc-button-active,
          .fc .fc-button-primary:not(:disabled):active {
            background-color: var(--color-primary);
            border-color: var(--color-primary);
            filter: brightness(0.85);
            opacity: 0.9;
          }

          .fc .fc-daygrid-day.fc-day-today,
          .fc .fc-timegrid-col.fc-day-today {
            background-color: var(--color-base-200);
          }

          .fc .fc-list-day-cushion {
            background-color: var(--color-base-200);
          }

          .fc .fc-col-header-cell-cushion,
          .fc .fc-list-day-text,
          .fc .fc-list-day-side-text {
            color: var(--color-base-content);
          }

          .fc-theme-standard td,
          .fc-theme-standard th,
          .fc-theme-standard .fc-scrollgrid {
            border-color: var(--color-base-300);
          }

          .fc .fc-timegrid-now-indicator-line {
            border-color: var(--color-error);
          }

          .fc .fc-timegrid-now-indicator-arrow {
            border-color: var(--color-error);
            color: var(--color-error);
          }

          .fc .fc-prev-button,
          .fc .fc-next-button,
          .fc .fc-today-button {
            background-color: var(--color-primary);
            border-color: var(--color-primary);
            color: var(--color-primary-content);
          }

          .fc .fc-prev-button:hover,
          .fc .fc-next-button:hover,
          .fc .fc-today-button:hover {
            background-color: var(--color-primary);
            border-color: var(--color-primary);
            filter: brightness(0.95);
            color: var(--color-primary-content);
          }

          .fc .fc-today-button:not(:disabled).fc-button-active,
          .fc .fc-today-button:not(:disabled):active {
            background-color: var(--color-accent);
            border-color: var(--color-accent);
            color: var(--color-accent-content);
          }

          .fc .fc-today-button:disabled {
            background-color: var(--color-base-300);
            border-color: var(--color-base-300);
            opacity: 0.7;
            color: var(--color-base-content);
          }

          .fc .fc-prev-button .fc-icon,
          .fc .fc-next-button .fc-icon {
            font-size: 1.2em;
          }

          .fc .fc-prev-button:disabled,
          .fc .fc-next-button:disabled {
            background-color: var(--color-base-300);
            border-color: var(--color-base-300);
            opacity: 0.7;
            color: var(--color-base-content);
            cursor: not-allowed;
          }

          .fc .fc-prev-button:disabled:hover,
          .fc .fc-next-button:disabled:hover {
            background-color: var(--color-base-300);
            filter: none;
          }

          .fc-timegrid-event .fc-event-main {
            display: flex;
            align-items: flex-start;
            justify-content: flex-start;
            height: 100%;
            white-space: normal;
            text-align: left;
            font-size: 0.95em;
            line-height: 1.2;
            padding: 4px 6px;
          }

          .fc-event-title {
            text-align: left;
          }
        `}</style>

        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
          events={events}
          headerToolbar={responsiveHeaderToolbar}
          footerToolbar={showFooterToolbar ? responsiveFooterToolbar : false}
          firstDay={firstDay}
          weekends={weekends}
          hiddenDays={hiddenDays}
          allDaySlot={allDaySlot}
          slotDuration={dynamicSlotDuration}
          slotMinTime={dynamicSlotMinTime}
          slotMaxTime={dynamicSlotMaxTime}
          eventColor={eventColor}
          eventBorderColor={eventBorderColor}
          eventTextColor={eventTextColor}
          nowIndicator={nowIndicator}
          expandRows={expandRows}
          locale={calendarLocale}
          timeZone={timeZone}
          buttonText={defaultButtonText}
          views={responsiveViews}
          navLinks={navLinks && !isMobile}
          eventTimeFormat={eventTimeFormat}
          slotLabelFormat={slotLabelFormat}
          validRange={validRange}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          height={"auto"}
          aspectRatio={isMobile ? 0.8 : 1.35}
          titleFormat={titleFormat}
          allDayText={t("schedule.event.allDay")}
          moreLinkText={t("schedule.event.more")}
          noEventsText={t("schedule.event.noEvents")}
        />
      </div>

      {showModal &&
        selectedEvent &&
        createPortal(
          selectedEvent.extendedProps?.isGroup ? (
            <GroupedActivityModal event={selectedEvent} onClose={handleCloseModal} />
          ) : (
            <EventModal event={selectedEvent} onClose={handleCloseModal} />
          ),
          document.body
        )}
    </div>
  );
}

export default function SchedulePreview(props) {
  const [activities, setActivities] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadScheduleData = async () => {
      try {
        setLoading(true);
        const api = getApi();
        const [activitiesResponse, typesResponse] = await Promise.all([
          api.get("/activities/"),
          api.get("/activity-types/"),
        ]);
        const activitiesData = activitiesResponse.data;
        const typesData = typesResponse.data;

        if (cancelled) {
          return;
        }

        setActivities(Array.isArray(activitiesData) ? activitiesData : []);
        setTypes(Array.isArray(typesData) ? typesData : []);
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err?.message || "Failed to fetch schedule data");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadScheduleData();

    return () => {
      cancelled = true;
    };
  }, []);

  const activityContextValue = useMemo(
    () => ({ activities, loading, error, types }),
    [activities, loading, error, types]
  );

  return (
    <ActivityContext.Provider value={activityContextValue}>
      <ScheduleComponent {...props} />
    </ActivityContext.Provider>
  );
}

ScheduleComponent.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  showFooterToolbar: PropTypes.bool,
  firstDay: PropTypes.number,
  weekends: PropTypes.bool,
  hiddenDays: PropTypes.arrayOf(PropTypes.number),
  slotDuration: PropTypes.string,
  slotMinTime: PropTypes.string,
  slotMaxTime: PropTypes.string,
  allDaySlot: PropTypes.bool,
  eventColor: PropTypes.string,
  eventBorderColor: PropTypes.string,
  eventTextColor: PropTypes.string,
  nowIndicator: PropTypes.bool,
  expandRows: PropTypes.bool,
  locale: PropTypes.string,
  timeZone: PropTypes.string,
  navLinks: PropTypes.bool,
  eventTimeFormat: PropTypes.object,
  slotLabelFormat: PropTypes.object,
  responsiveThreshold: PropTypes.number,
};

EventModal.propTypes = {
  event: PropTypes.shape({
    title: PropTypes.string.isRequired,
    start: PropTypes.instanceOf(Date).isRequired,
    id: PropTypes.string,
    extendedProps: PropTypes.shape({
      topic: PropTypes.string,
      speaker: PropTypes.string,
      description: PropTypes.string,
      location: PropTypes.string,
    }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

GroupedActivityModal.propTypes = {
  event: PropTypes.shape({
    title: PropTypes.string.isRequired,
    start: PropTypes.instanceOf(Date).isRequired,
    extendedProps: PropTypes.shape({
      groupedActivities: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number.isRequired,
          name: PropTypes.string.isRequired,
          date: PropTypes.string.isRequired,
          room: PropTypes.string,
          topic: PropTypes.string,
          speaker: PropTypes.string,
          moderator: PropTypes.string,
          discussant: PropTypes.string,
        })
      ),
    }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};
