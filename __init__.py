from .router import router
from .schemas.ui.components import Schedule
from services.component_registry import ComponentRegistry
import logging

logger = logging.getLogger("coffeebreak.core")

def register_plugin():
    ComponentRegistry.register_component(Schedule)
    logger.debug("Schedule component registered.")
    return router

def unregister_plugin():
    ComponentRegistry.unregister_component("Schedule")
    logger.debug("Schedule component unregistered.")

REGISTER = register_plugin
UNREGISTER = unregister_plugin