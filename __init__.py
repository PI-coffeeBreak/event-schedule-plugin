from .schemas.ui.components.schedule import Schedule
from coffeebreak import ComponentRegistry, plugin_settings
from coffeebreak.schemas import PluginSetting
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger("coffeebreak.core")

PLUGIN_TITLE = "event-schedule-plugin"
NAME = "Event Schedule Plugin"
DESCRIPTION = "A plugin for displaying an event schedule"

class Settings(BaseModel):
    enable_grouping: bool = Field(
        default=True,
        title="Enable Activity Grouping",
        description="Automatically group parallel sessions that start at similar times",
        options=["Yes", "No"]
    )
    time_threshold: int = Field(
        default=15,
        title="Time Threshold (minutes)",
        description="Maximum time difference to consider activities as parallel (in minutes)",
        ge=5,
        le=60
    )
    min_group_size: int = Field(
        default=2,
        title="Minimum Group Size",
        description="Minimum number of activities required to form a group",
        ge=2,
        le=10
    )
    duration_variance: float = Field(
        default=0.5,
        title="Duration Variance",
        description="Maximum duration difference as a percentage (0.5 = ±50%)",
        ge=0.1,
        le=1.0
    )
    group_by_type: bool = Field(
        default=True,
        title="Group by Activity Type",
        description="Only group activities of the same type together",
        options=["Yes", "No"]
    )

SETTINGS = Settings()

plugin_inputs = plugin_settings.generate_inputs_from_settings(Settings)

async def register_plugin():
    ComponentRegistry.register_component(Schedule)
    logger.debug("Schedule component registered.")

    setting = PluginSetting(
        title=PLUGIN_TITLE,
        name=NAME,
        description=DESCRIPTION,
        inputs=plugin_inputs
    )
    await plugin_settings.create_plugin_setting(setting)

    logger.debug("Schedule plugin settings registered.")

async def unregister_plugin():
    ComponentRegistry.unregister_component("Schedule")
    await plugin_settings.delete_plugin_setting_by_title(PLUGIN_TITLE)
    logger.debug("Schedule plugin unregistered.")

REGISTER = register_plugin
UNREGISTER = unregister_plugin

CONFIG_PAGE = True
