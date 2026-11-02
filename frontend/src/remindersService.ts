import { LocalNotifications } from "@capacitor/local-notifications";
import { createReminderService } from "./reminders";

/** The app's reminders, wired to the real phone notifications. Only does anything in the Android app. */
export const reminders = createReminderService(LocalNotifications);
