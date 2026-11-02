/** DRAFT consent wording, not yet reviewed by a supervisor or ethics committee.
 *  The version is stored with every consent. backend/calibration_questions.json lists the
 *  versions the server accepts; a test keeps the two in step. */
export const CONSENT_VERSION = "v0-draft";

export const WHO_SEES_IT = "the MindWatch project team and its markers";
// Deliberately visible in the app until a real contact is filled in.
export const CONTACT = "[PROJECT CONTACT: add a name and email before real use]";

export const CONSENT_PARAGRAPHS: string[] = [
  "MindWatch is a university project. It is not medical advice and can't diagnose anything.",
  "We will store: your email, a scrambled version of your password, your answers to the starting-point questions, your daily stress ratings, and, if you connect a watch, your sleep, steps and heart readings.",
  `This is used to show you your own patterns and to test how well a personal model works on your data. It is seen only by ${WHO_SEES_IT}.`,
  `You can delete your account and all your data at any time, in the app. ${CONTACT}`,
  "If you are in distress, the Support page lists people you can contact.",
];

export const ADULT_LABEL = "I am 18 or over.";
export const AGREE_LABEL = "I have read this and agree.";
