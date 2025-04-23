from pydantic import Field
from schemas.ui.page import BaseComponentSchema
from enum import Enum


class CalendarView(str, Enum):
    """Supported calendar view types"""
    # Day views (most detailed)
    TIMEGRID_DAY = "timeGridDay"      # Day with time slots - best for detailed schedules
    DAYGRID_DAY = "dayGridDay"        # Day with all-day display
    LIST_DAY = "listDay"              # List view for a day
    
    # Week views (good balance for multiple days)
    TIMEGRID_WEEK = "timeGridWeek"    # Week with time slots - good for detailed schedules
    DAYGRID_WEEK = "dayGridWeek"      # Week with all-day display
    LIST_WEEK = "listWeek"            # List view for a week
    
    # Month views (less common for focused schedules)
    DAYGRID_MONTH = "dayGridMonth"    # Traditional month view
    LIST_MONTH = "listMonth"          # List view for a month


class WeekDay(int, Enum):
    """Days of the week enum"""
    SUNDAY = 0
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6


class ToolbarButton(str, Enum):
    """Individual buttons for toolbar configuration"""
    PREV = "prev"
    NEXT = "next" 
    TODAY = "today"
    TITLE = "title"
    DAYGRID_DAY = "dayGridDay"
    TIMEGRID_DAY = "timeGridDay"
    TIMEGRID_WEEK = "timeGridWeek"
    LIST_DAY = "listDay"
    LIST_WEEK = "listWeek"


class ToolbarButtonGroup(str, Enum):
    """Common button combinations for toolbar sections"""
    # Navigation groups
    NAV_PREV_NEXT = "prev,next"
    NAV_PREV_NEXT_TODAY = "prev,next today"
    
    # Title groups
    TITLE_ONLY = "title"
    
    # Short timeframe view groups
    VIEW_TODAY = "timeGridDay"
    VIEW_DAY_WEEK = "timeGridWeek"
    VIEW_TIMEGRID_DAY_WEEK = "timeGridDay,timeGridWeek"
    VIEW_LIST_DAY_WEEK = "listDay,listWeek"
    VIEW_ALL_SHORT = "timeGridDay,timeGridWeek,listDay"
    
    # Custom combinations
    EMPTY = ""  # No buttons


class Schedule(BaseComponentSchema):
    """
    Schema for Schedule component using FullCalendar
    
    This component renders a configurable calendar focused on shorter timeframes
    like days and weeks rather than months.
    """
    title: str = Field(..., description="Title of the schedule")
    description: str = Field(..., description="Description of the schedule")

    # FullCalendar View Options
    initialView: CalendarView = Field(
        default=CalendarView.TIMEGRID_DAY,
        description="The initial view type to display"
    )
    
    # Header toolbar with common button combinations
    headerToolbarLeft: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.NAV_PREV_NEXT_TODAY,
        description="Left section of the header toolbar"
    )
    headerToolbarCenter: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.TITLE_ONLY,
        description="Center section of the header toolbar"
    )
    headerToolbarRight: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.VIEW_DAY_WEEK,
        description="Right section of the header toolbar"
    )
    
    # Footer toolbar with common button combinations
    showFooterToolbar: bool = Field(
        default=False,
        description="Whether to show the footer toolbar"
    )
    footerToolbarLeft: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.EMPTY,
        description="Left section of the footer toolbar"
    )
    footerToolbarCenter: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.EMPTY,
        description="Center section of the footer toolbar"
    )
    footerToolbarRight: ToolbarButtonGroup = Field(
        default=ToolbarButtonGroup.EMPTY,
        description="Right section of the footer toolbar"
    )

    # Day/Week Options
    firstDay: WeekDay = Field(
        default=WeekDay.MONDAY,
        description="First day of the week"
    )
    
    # Time Options
    slotDuration: str = Field(
        default="00:15:00",
        description="Duration of time slots (e.g. '00:15:00' for 15 minutes)"
    )
    slotMinTime: str = Field(
        default="08:00:00",
        description="First time slot displayed"
    )
    slotMaxTime: str = Field(
        default="22:00:00",
        description="Last time slot displayed"
    )

    # Event Options
    allDaySlot: bool = Field(
        default=False,
        description="Whether to show an 'all-day' slot at the top"
    )
    nowIndicator: bool = Field(
        default=True,
        description="Whether to show a marker for the current time"
    )

    # Display Options
    expandRows: bool = Field(
        default=True,
        description="Whether to expand rows to fill the available height"
    )
    
    # Internationalization
    locale: str = Field(
        default="en",
        description="Calendar locale (e.g. 'en', 'pt-br', 'fr')"
    )
    timeZone: str = Field(
        default="local",
        description="Calendar timezone (e.g. 'local', 'UTC')"
    )

    # Business hours
    businessHoursStart: str = Field(
        default="09:00",
        description="Start time for business hours (format: 'HH:MM')"
    )
    businessHoursEnd: str = Field(
        default="17:00", 
        description="End time for business hours (format: 'HH:MM')"
    )
    highlightBusinessHours: bool = Field(
        default=True,
        description="Whether to visually highlight business hours"
    )
    
    def model_dump(self, *args, **kwargs):
        """Custom serialization to format the data for FullCalendar"""
        data = super().model_dump(*args, **kwargs)
        
        # Format header toolbar
        data["headerToolbar"] = {
            "left": data.pop("headerToolbarLeft"),
            "center": data.pop("headerToolbarCenter"),
            "right": data.pop("headerToolbarRight")
        }
        
        # Format footer toolbar if needed
        show_footer = data.pop("showFooterToolbar")
        f_left = data.pop("footerToolbarLeft")
        f_center = data.pop("footerToolbarCenter")
        f_right = data.pop("footerToolbarRight")
        
        if show_footer:
            data["footerToolbar"] = {
                "left": f_left,
                "center": f_center,
                "right": f_right
            }
        
        # Format business hours
        bh_start = data.pop("businessHoursStart")
        bh_end = data.pop("businessHoursEnd")
        highlight_bh = data.pop("highlightBusinessHours")
        
        if highlight_bh:
            data["businessHours"] = {
                "daysOfWeek": [1, 2, 3, 4, 5],  # Monday to Friday
                "startTime": bh_start,
                "endTime": bh_end
            }
        
        return data