/** Colours for the word and energy chips. Light fills with their own dark text, so every
 *  pairing reads at 6.5:1 or better on the dark app. Colour only tells chips apart; it never
 *  means good or bad. */

interface ChipColour {
  background: string;
  color: string;
}

// The word of the day: one calm colour, so a feeling word never looks "red" or "green".
export const WORD_CHIP: ChipColour = { background: "#cecbf6", color: "#26215c" };

const ENERGY_COLOURS: Record<string, ChipColour> = {
  Exams: { background: "#f4c0d1", color: "#4b1528" },
  Deadlines: { background: "#f0997b", color: "#4a1b0c" },
  Lectures: { background: "#b5d4f4", color: "#042c53" },
  "Group work": { background: "#9fe1cb", color: "#04342c" },
  Sleep: { background: "#cecbf6", color: "#26215c" },
  Social: { background: "#fac775", color: "#412402" },
  Family: { background: "#9fe1cb", color: "#04342c" },
  Money: { background: "#fac775", color: "#412402" },
  Health: { background: "#f4c0d1", color: "#4b1528" },
  Other: { background: "#d3d1c7", color: "#2c2c2a" },
};

export function energyChip(tag: string): ChipColour {
  return ENERGY_COLOURS[tag] ?? ENERGY_COLOURS.Other;
}

/** Shared chip shape. Pair with WORD_CHIP or energyChip(tag) as an inline style. */
export const chipClass = "px-3 py-1 rounded-full text-sm";
