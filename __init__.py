from .schemas.ui.components.schedule import Schedule
from services.component_registry import ComponentRegistry
import logging

logger = logging.getLogger("coffeebreak.event-schedule-plugin")

NAME = "Event Schedule Plugin"
DESCRIPTION = "A plugin for displaying an event schedule"

def register_plugin():
    ComponentRegistry.register_component(Schedule)
    logger.debug("Schedule component registered.")

def unregister_plugin():
    ComponentRegistry.unregister_component("Schedule")
    logger.debug("Schedule component unregistered.")

REGISTER = register_plugin
UNREGISTER = unregister_plugin

CONFIG_PAGE = True
