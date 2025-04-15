from pydantic import Field
from schemas.ui.page import BaseComponentSchema


class Schedule(BaseComponentSchema):
    """
    Schema for Schedule component

    Attributes:
        title (str): Title of the schedule
        description (str): Description of the schedule
        className (str): CSS classes to be applied
    """
    title: str = Field(..., description="Title of the schedule")
    description: str = Field(..., description="Description of the schedule")
    className: str = Field(
        default="",
        description="CSS classes to be applied",
        optional=True
    )