import { useState } from "react";
import { ADULT_LABEL, AGREE_LABEL, CONSENT_PARAGRAPHS } from "../consentText";
import AuthFrame, { linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface Props {
  onAgree: () => void;
  onBack: () => void;
}

export default function ConsentScreen({ onAgree, onBack }: Props) {
  const [adult, setAdult] = useState(false);
  const [agreed, setAgreed] = useState(false);

  return (
    <AuthFrame title="Before you start">
      <div className="space-y-3 text-sm text-muted">
        {CONSENT_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5" />
        <span>{ADULT_LABEL}</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>{AGREE_LABEL}</span>
      </label>
      <button
        type="button"
        disabled={!(adult && agreed)}
        onClick={onAgree}
        className={primaryButtonClass}
        style={{ fontWeight: 500 }}
      >
        Continue
      </button>
      <div>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
