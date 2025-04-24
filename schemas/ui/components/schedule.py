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

    # Day/Week Options
    firstDay: WeekDay = Field(
        default=WeekDay.MONDAY,
        description="First day of the week"
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