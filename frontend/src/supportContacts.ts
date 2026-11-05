/**
 * People to contact for support. A test compares this list, number for number, with a separate
 * hard-coded copy, so an accidental edit to a number fails the build.
 *
 * Source: the table in APP_PLAN.md (2 November 2026), which lists the NTU contacts and the
 * national lines. The numbers were copied from the plan and not independently checked.
 *
 * The owner has confirmed the after-hours number.
 */
export interface Phone {
  /** How it is written on screen. */
  display: string;
  /** What the phone dials. */
  tel: string;
}

export interface Contact {
  name: string;
  /** When they are available, if it matters. */
  hours?: string;
  phones: Phone[];
  email?: string;
}

export interface ContactGroup {
  title: string;
  contacts: Contact[];
}

const sg = (digits: string): Phone => ({
  display: `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`,
  tel: `+65${digits}`,
});

export const SUPPORT_GROUPS: ContactGroup[] = [
  {
    title: "NTU",
    contacts: [
      {
        name: "Student counselling",
        hours: "Office hours, 9 am to 5 pm",
        phones: [sg("67904462")],
        email: "ucc-students@ntu.edu.sg",
      },
      { name: "After-hours Psychological Emergency Line", phones: [sg("67904462")] },
      {
        name: "Staff counselling (Employee Assistance Programme)",
        hours: "24 hours",
        phones: [sg("69041101")],
        email: "ucc-employees@ntu.edu.sg",
      },
      {
        name: "University Wellbeing Office, critical support",
        hours: "24 hours",
        phones: [sg("65141911")],
        email: "UWO-incidentsupport@ntu.edu.sg",
      },
      { name: "NTU Campus Security", hours: "24 hours", phones: [sg("67905200")] },
    ],
  },
  {
    title: "Anywhere in Singapore",
    contacts: [
      {
        name: "Emergency: Police and Ambulance",
        phones: [
          { display: "999 (Police)", tel: "999" },
          { display: "995 (Ambulance)", tel: "995" },
        ],
      },
      { name: "National Mindline", hours: "24 hours, every day", phones: [{ display: "1771", tel: "1771" }] },
      { name: "Samaritans of Singapore", hours: "24 hours", phones: [{ display: "1767", tel: "1767" }] },
      { name: "Institute of Mental Health helpline", phones: [sg("63892222")] },
    ],
  },
];
