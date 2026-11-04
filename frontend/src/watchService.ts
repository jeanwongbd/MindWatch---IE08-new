import { HealthFitness } from "@capacitor/health-fitness";
import { createWatchService } from "./watch";

/** The app's watch data service, wired to the real Health Connect plugin. Only does anything in the Android app. */
export const watchService = createWatchService(HealthFitness);
