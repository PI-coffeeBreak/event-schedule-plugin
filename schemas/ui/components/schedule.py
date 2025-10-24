from pydantic import Field
from coffeebreak.schemas import BaseComponent as BaseComponentSchema

class Schedule(BaseComponentSchema):
    """
    Schema for Schedule component using FullCalendar
    
    This component renders a configurable calendar focused on shorter timeframes
    like days and weeks rather than months.
    """
    title: str = Field(..., description="Title of the schedule")
    description: str = Field(..., description="Description of the schedule")

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