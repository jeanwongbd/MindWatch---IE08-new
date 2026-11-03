/** Consent wording, as supplied by the project owner. The version is stored with every consent.
 *  backend/calibration_questions.json lists the versions the server accepts; a test keeps the two
 *  in step. */
export const CONSENT_VERSION = "v0-draft-2";

export const CONSENT_PARAGRAPHS: string[] = [
  "MindWatch is a university project. It is not medical advice and can’t diagnose anything.",
  "We will store: your email, a scrambled version of your password, your answers to the starting-point questions, your daily stress ratings, if you have no smart watch, your own answers about your sleep and activity, and, if you connect a watch, your sleep, steps and heart readings.",
  "This is used to show you your own patterns and to test how well a personal model works on your data.",
  "You can delete your account and all your data at any time, in the app.",
  "If you are in distress, the Support page lists people you can contact.",
];

export const ADULT_LABEL = "I am 18 or over.";
export const AGREE_LABEL = "I have read this and agree.";
