from .schemas.ui.components.schedule import Schedule
from coffeebreak import ComponentRegistry
from pydantic import BaseModel, Field


class Settings(BaseModel):
    enable_grouping: bool = Field(
        default=True,
        title="Enable Activity Grouping",
        description="Automatically group parallel sessions that start at similar times",
        options=["Yes", "No"],
    )
    time_threshold: int = Field(
        default=15,
        title="Time Threshold (minutes)",
        description="Maximum time difference to consider activities as parallel (in minutes)",
        ge=5,
        le=60,
    )
    min_group_size: int = Field(
        default=2,
        title="Minimum Group Size",
        description="Minimum number of activities required to form a group",
        ge=2,
        le=10,
    )
    duration_variance: float = Field(
        default=0.5,
        title="Duration Variance",
        description="Maximum duration difference as a percentage (0.5 = ±50%)",
        ge=0.1,
        le=1.0,
    )
    group_by_type: bool = Field(
        default=True,
        title="Group by Activity Type",
        description="Only group activities of the same type together",
        options=["Yes", "No"],
    )


SETTINGS = Settings()


def REGISTER():
    ComponentRegistry.register_component(Schedule)


def UNREGISTER():
    ComponentRegistry.unregister_component("Schedule")
