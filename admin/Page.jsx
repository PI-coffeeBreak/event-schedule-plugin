import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useActivities, useNotification, useEvent, useMedia } from "coffeebreak/contexts";
import { FaChevronDown, FaChevronUp, FaSearch, FaTrash, FaExclamationTriangle } from "react-icons/fa";
import i18next from "i18next";
import { registerPluginTranslations } from "coffeebreak";
import en from "../locales/en.json";
import ptBR from "../locales/pt-BR.json";
import ptPT from "../locales/pt-PT.json";

const NS = "event-schedule-plugin";
registerPluginTranslations(NS, { en, "pt-BR": ptBR, "pt-PT": ptPT });

const t = (key) => i18next.t(key, { ns: NS });

// --- Inlined utilities ---

function utcToLocalDatetimeLocal(utcISOString) {
  if (!utcISOString) return "";
  const utcDate = new Date(utcISOString);
  if (isNaN(utcDate.getTime())) return "";
  const tzOffset = utcDate.getTimezoneOffset();
  const localDate = new Date(utcDate.getTime() - tzOffset * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;
}

function localDatetimeLocalToUTC(localDateString) {
  if (!localDateString) return undefined;
  const date = new Date(localDateString);
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

const canGroupActivities = (a1, a2, settings, types) => {
  const { time_threshold = 15, duration_variance = 0.5, group_by_type = true } = settings;
  const type1 = types?.find((t) => t.id === a1.type_id);
  const type2 = types?.find((t) => t.id === a2.type_id);
  if (type1?.grouping?.canGroup === false || type2?.grouping?.canGroup === false) return false;
  if (group_by_type && a1.type_id !== a2.type_id) return false;
  const t1 = new Date(a1.date).getTime(), t2 = new Date(a2.date).getTime();
  const d1 = a1.duration || 30, d2 = a2.duration || 30;
  const end1 = t1 + d1 * 60000, end2 = t2 + d2 * 60000;
  if (Math.abs(end1 - t2) <= 300000 || Math.abs(end2 - t1) <= 300000) return true;
  if (Math.abs(t1 - t2) / 60000 > time_threshold) return false;
  return Math.abs(d1 - d2) / Math.max(d1, d2) <= duration_variance;
};

function smartGroupActivities(activities, types, settings) {
  const { enable_grouping = true, min_group_size = 2 } = settings || {};
  if (!enable_grouping) return { groups: [], standalone: [...activities] };
  const sorted = [...activities].sort((a, b) => new Date(a.date) - new Date(b.date));
  const groups = [], processed = new Set(), standalone = [];
  sorted.forEach((activity, index) => {
    if (processed.has(activity.id)) return;
    const type = types?.find((t) => t.id === activity.type_id);
    if (type?.grouping?.canGroup === false) { standalone.push(activity); processed.add(activity.id); return; }
    const group = [activity];
    processed.add(activity.id);
    for (let i = index + 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (processed.has(candidate.id)) continue;
      if (group.some((ga) => canGroupActivities(ga, candidate, settings, types))) {
        group.push(candidate); processed.add(candidate.id);
      }
    }
    if (group.length >= min_group_size) groups.push(group);
    else group.forEach((act) => { standalone.push(act); processed.delete(act.id); });
  });
  return { groups, standalone };
}

function getGroupMetadata(group) {
  if (!group || group.length === 0) return null;
  const startTimes = group.map((a) => new Date(a.date));
  const endTimes = group.map((a) => new Date(new Date(a.date).getTime() + (a.duration || 30) * 60000));
  const earliestStart = new Date(Math.min(...startTimes));
  const latestEnd = new Date(Math.max(...endTimes));
  return { count: group.length, startTime: earliestStart, endTime: latestEnd, duration: (latestEnd - earliestStart) / 60000 };
}

// --- Inlined UI components ---

function DeleteConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-base-100 rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <div className="flex items-center gap-3 mb-4">
          <div className="text-primary"><FaExclamationTriangle size={24} /></div>
          <p>{message}</p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function Activity({ id, title, description, image, category, type, onDelete, activityTypes }) {
  const { getMediaUrl } = useMedia();
  const [imageUrl, setImageUrl] = useState(null);
  useEffect(() => {
    if (image) setImageUrl(image.startsWith("http") ? image : getMediaUrl(image));
    else setImageUrl(null);
  }, [id, image, getMediaUrl]);

  const typeObj = activityTypes?.find((t) => t.type === type);

  return (
    <div className="group card bg-base-100 shadow-sm border-2 border-secondary hover:border-primary overflow-hidden fc-event activity-card" data-id={id} data-title={title} style={{ width: "180px", userSelect: "none" }}>
      <div className="h-24 w-full overflow-hidden bg-base-200 relative shrink-0">
        {imageUrl ? <img src={imageUrl} alt={title} className="w-full h-full object-cover" onError={() => setImageUrl(null)} /> : <div className="w-full h-full bg-base-200/50 flex items-center justify-center"><span className="text-xs italic opacity-40">No image</span></div>}
        {typeObj && <div className="absolute bottom-1 left-1"><span className="badge badge-xs border-none" style={{ backgroundColor: typeObj.color || "var(--color-primary)", color: "#fff" }}>{typeObj.type}</span></div>}
        {onDelete && (
          <button className="absolute top-1 right-1 p-1 bg-base-100/80 hover:bg-white text-error rounded" onClick={(e) => { e.stopPropagation(); onDelete(id); }} type="button" aria-label="Delete">
            <FaTrash className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-2">
        <h2 className="text-xs font-bold text-primary line-clamp-1">{title}</h2>
        {category && <span className="badge badge-outline badge-xs text-xs opacity-70">{category}</span>}
        <p className="text-xs text-base-content/70 line-clamp-2 mt-1">{description}</p>
      </div>
    </div>
  );
}

const findActivityById = (activities, activityId) => {
  const activity = activities.find((entry) => entry.id === parseInt(activityId, 10));
  if (!activity) {
    console.error("Activity not found for ID:", activityId);
  }
  return activity;
};

const formatDuration = (duration) => {
  if (duration > 0) {
    const hours = Math.floor(duration / 60)
      .toString()
      .padStart(2, "0");
    const minutes = (duration % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return "02:00";
};

const formatToLocalISOString = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
};

export default function DragDropCalendar() {
  const calendarRef = useRef(null);
  const [activitiesCollapsed, setActivitiesCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { eventInfo } = useEvent();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activityToRemove, setActivityToRemove] = useState(null);
  const [enableGrouping, setEnableGrouping] = useState(false);

  const {
    activities,
    activityTypes,
    calendarActivities,
    outsideActivities,
    fetchActivities,
    fetchActivityTypes,
    updateActivity,
    deleteActivity,
    setCalendarActivities,
    setOutsideActivities,
  } = useActivities();

  const { showNotification } = useNotification();

  useEffect(() => {
    fetchActivityTypes();
    fetchActivities();
  }, []);

  useEffect(() => {
    if (activities.length > 0 && calendarRef.current) {
      const draggableRef = { current: null };

      const timer = setTimeout(() => {
        if (!draggableRef.current) {
          draggableRef.current = new Draggable(
            document.getElementById("draggable-activities"),
            {
              itemSelector: ".fc-event",
              eventData: (eventEl) => {
                const activityId = eventEl.getAttribute("data-id");
                const activity = findActivityById(activities, activityId);

                return {
                  title: eventEl.getAttribute("data-title"),
                  duration: formatDuration(activity?.duration || 0),
                  "data-id": activityId,
                };
              },
            }
          );
        }
      }, 1000);

      return () => {
        clearTimeout(timer);
        if (
          draggableRef.current &&
          typeof draggableRef.current.destroy === "function"
        ) {
          draggableRef.current.destroy();
        }
        draggableRef.current = null;
      };
    }
  }, [activities]);

  const handleEventReceive = async (info) => {
    const activityId = parseInt(info.event.extendedProps["data-id"], 10);
    const activity = findActivityById(activities, activityId);

    if (activity) {
      setCalendarActivities((prev) => [...prev, activity]);
      setOutsideActivities((prev) => prev.filter((entry) => entry.id !== activityId));

      const startTime = info.event.start;
      const localDatetimeLocal = `${startTime.getFullYear()}-${String(
        startTime.getMonth() + 1
      ).padStart(2, "0")}-${String(startTime.getDate()).padStart(2, "0")}T${String(
        startTime.getHours()
      ).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`;
      const utcISOString = localDatetimeLocalToUTC(localDatetimeLocal);

      await updateActivity(activityId, { date: utcISOString });
    }
  };

  const handleEventResize = async (info) => {
    const activityId = parseInt(info.event.extendedProps["data-id"], 10);
    const newDuration = Math.round((info.event.end - info.event.start) / 60000);

    await updateActivity(activityId, { duration: newDuration });

    setCalendarActivities((prev) =>
      prev.map((entry) =>
        entry.id === activityId ? { ...entry, duration: newDuration } : entry
      )
    );
  };

  const handleEventDrop = async (info) => {
    const activityId = parseInt(info.event.extendedProps["data-id"], 10);

    const startTime = info.event.start;
    const localDatetimeLocal = `${startTime.getFullYear()}-${String(
      startTime.getMonth() + 1
    ).padStart(2, "0")}-${String(startTime.getDate()).padStart(2, "0")}T${String(
      startTime.getHours()
    ).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`;
    const utcISOString = localDatetimeLocalToUTC(localDatetimeLocal);

    await updateActivity(activityId, { date: utcISOString });
  };

  const handleEventClick = (info) => {
    if (info.event.extendedProps.isGroup) {
      showNotification(
        "Cannot remove grouped activities. Disable grouping first.",
        "info"
      );
      return;
    }

    const activityId = parseInt(info.event.extendedProps["data-id"], 10);
    const activityTitle = info.event.title;
    setActivityToRemove({ id: activityId, title: activityTitle, event: info.event });
    setDeleteModalOpen(true);
  };

  const confirmRemoveActivity = async () => {
    if (activityToRemove) {
      const { id, event } = activityToRemove;

      await updateActivity(id, { date: null });

      setCalendarActivities((prev) => prev.filter((entry) => entry.id !== id));
      setOutsideActivities((prev) => {
        const isAlreadyPresent = prev.some((entry) => entry.id === id);
        return isAlreadyPresent ? prev : [...prev, activities.find((entry) => entry.id === id)];
      });

      event.remove();
      setActivityToRemove(null);
      setDeleteModalOpen(false);
    }
  };

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().updateSize();
    }
  }, [activitiesCollapsed]);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this activity?")) {
      try {
        await deleteActivity(id);
        setOutsideActivities((prev) =>
          prev.filter((activity) => activity.id !== parseInt(id, 10))
        );
        showNotification("Activity deleted successfully", "success");
      } catch (error) {
        showNotification("Failed to delete activity", "error");
        console.error("Error deleting activity:", error);
      }
    }
  };

  const toggleActivitiesPanel = () => {
    setActivitiesCollapsed(!activitiesCollapsed);
  };

  const [selectedType, setSelectedType] = useState("");

  const filteredActivities = outsideActivities.filter((activity) => {
    const matchesSearch =
      !searchQuery ||
      activity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = !selectedType || activity.type_id.toString() === selectedType;

    return matchesSearch && matchesType;
  });

  const processedCalendarActivities = useMemo(() => {
    if (!enableGrouping || calendarActivities.length === 0) {
      return calendarActivities;
    }

    const groupingSettings = {
      enable_grouping: true,
      time_threshold: 15,
      min_group_size: 2,
      duration_variance: 0.5,
      group_by_type: true,
    };

    const { groups, standalone } = smartGroupActivities(
      calendarActivities,
      activityTypes,
      groupingSettings
    );

    const groupedActivities = groups.map((group, index) => {
      const metadata = getGroupMetadata(group);
      const activityType = activityTypes.find((type) => type.id === group[0].type_id);
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
  }, [calendarActivities, activityTypes, enableGrouping]);

  const totalScheduledActivities = calendarActivities.length;
  const totalUnscheduledActivities = outsideActivities.length;
  const totalActivitiesDuration = calendarActivities.reduce(
    (total, activity) => total + (activity.duration || 0),
    0
  );
  const hours = Math.floor(totalActivitiesDuration / 60);
  const minutes = totalActivitiesDuration % 60;

  return (
    <div className="flex flex-col p-4 sm:p-6 lg:p-8 h-[calc(100vh-64px)]">
      <div className="">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold my-8">Event Schedule</h1>
          <div className="flex gap-3 items-center">
            <label className="label cursor-pointer gap-2">
              <span className="label-text">Group Activities</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={enableGrouping}
                onChange={(e) => setEnableGrouping(e.target.checked)}
              />
            </label>
            <button
              onClick={toggleActivitiesPanel}
              className="btn btn-sm btn-secondary rounded-xl"
            >
              {activitiesCollapsed ? "Show Activities" : "Hide Activities"}
              {activitiesCollapsed ? (
                <FaChevronDown className="ml-2" />
              ) : (
                <FaChevronUp className="ml-2" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-grow overflow-hidden">
        <div
          className={`transition-all duration-300 bg-base-100 ${
            activitiesCollapsed ? "h-0" : "flex flex-row w-full"
          }`}
        >
          <div id="draggable-activities" className="flex-grow w-0 overflow-y-auto">
            <div className="mx-auto">
              <div className="flex gap-4">
                <div>
                  <label className="input input-bordered w-64 rounded-xl flex items-center gap-2">
                    <FaSearch className="text-gray-400" />
                    <input
                      type="text"
                      className="grow"
                      placeholder="Search activities"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="filter w-32">
                  <select
                    className="select select-bordered rounded-xl"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="">All</option>
                    {activityTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full">
                  <div className="bg-secondary flex items-center pl-2 gap-2 rounded-xl">
                    <h1 className="text-secondary-content font-light">Scheduled</h1>
                    <div className="text-secondary-content text-xl font-bold">
                      {totalScheduledActivities}
                    </div>
                  </div>
                  <div className="bg-secondary flex items-center pl-2 gap-2 rounded-xl">
                    <h1 className="text-secondary-content font-light">Unscheduled</h1>
                    <div className="text-secondary-content text-xl font-bold">
                      {totalUnscheduledActivities}
                    </div>
                  </div>
                  <div className="bg-secondary flex items-center pl-2 gap-2 rounded-xl">
                    <h1 className="text-secondary-content font-light">Total Duration</h1>
                    <div className="text-secondary-content text-xl font-bold">
                      {hours}h {minutes}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-grow overflow-hidden">
                <div className="overflow-x-auto pb-2 hide-scrollbar max-w-full">
                  <div className="flex flex-row flex-nowrap mt-4 gap-2 w-max">
                    {filteredActivities.map((activity) => (
                      <Activity
                        key={activity.id}
                        id={activity.id}
                        title={activity.name}
                        description={activity.description}
                        image={activity.image}
                        category={activity.topic}
                        type={
                          activityTypes.find((type) => type.id === activity.type_id)?.type
                        }
                        onDelete={handleDelete}
                        className="fc-event activity-card shrink-0"
                        data-id={activity.id}
                        data-title={activity.name}
                        style={{ width: "180px" }}
                        activityTypes={activityTypes}
                      />
                    ))}
                    {filteredActivities.length === 0 && (
                      <div className="min-w-full flex justify-center items-center py-12">
                        <div className="text-center mx-auto">
                          <FaSearch className="mx-auto text-3xl text-gray-400 mb-4" />
                          <p className="text-xl text-gray-500">{t("activities.noActivities")}</p>
                          <p className="text-gray-400">{t("activities.trySearch")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-grow overflow-auto p-1">
          <div className="h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "timeGridWeek,timeGridDay",
              }}
              height="100%"
              editable={true}
              droppable={true}
              eventReceive={handleEventReceive}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              slotDuration={"00:15:00"}
              slotLabelInterval={"01:00:00"}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              snapDuration={"00:01:00"}
              allDaySlot={false}
              dayMaxEvents={true}
              nowIndicator={true}
              scrollTime={new Date().getHours() + ":00:00"}
              timeZone="local"
              validRange={{
                start: eventInfo?.start_time ? new Date(eventInfo.start_time) : undefined,
                end: eventInfo?.end_time ? new Date(eventInfo.end_time) : undefined,
              }}
              slotLabelFormat={{
                hour: "2-digit",
                minute: "2-digit",
                meridiem: false,
                hour12: false,
              }}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                meridiem: false,
                hour12: false,
                timeZone: "local",
              }}
              forceEventDuration={true}
              defaultTimedEventDuration={"00:30:00"}
              events={processedCalendarActivities.map((activity) => {
                const startDate = activity.isGroup
                  ? activity.date
                  : utcToLocalDatetimeLocal(activity.date);
                const durationInMs = activity.duration * 60000;
                const endDate = new Date(new Date(startDate).getTime() + durationInMs);

                const activityType = activityTypes.find(
                  (type) => type.id === activity.type_id
                );
                const backgroundColor = activityType?.color || "#3788d8";

                return {
                  id: activity.id,
                  title: activity.name,
                  start: startDate,
                  end: endDate,
                  backgroundColor,
                  borderColor: backgroundColor,
                  textColor: "#ffffff",
                  editable: !activity.isGroup,
                  extendedProps: {
                    "data-id": activity.id,
                    "data-title": activity.name,
                    description: activity.description,
                    category: activity.topic,
                    isGroup: activity.isGroup || false,
                    groupedActivities: activity.groupedActivities || [],
                  },
                };
              })}
            />
          </div>
        </div>
      </div>
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmRemoveActivity}
        title={"Remove Activity"}
        message={`Are you sure you want to remove "${activityToRemove?.title}" from the schedule?`}
      />
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          height: 6px;
        }
        .hide-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
        .hide-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .hide-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
        }

        .fc-event,
        .activity-card {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }
      `}</style>
    </div>
  );
}
