import { SUPPORT_GROUPS } from "../supportContacts";
import AuthFrame, { linkButtonClass } from "./AuthFrame";

interface Props {
  onBack: () => void;
}

const linkClass = "text-accent-calm underline underline-offset-2";

/** People to contact. Reachable from Welcome and Home, so it can be found without an account. */
export default function SupportScreen({ onBack }: Props) {
  return (
    <AuthFrame title="Support">
      <p className="text-sm text-muted text-center">
        If you're struggling, you don't have to manage it alone. These are people you can contact.
      </p>
      <p className="text-sm text-ink text-center">If you are in immediate danger, call 999 (Police) or 995 (Ambulance).</p>

      {SUPPORT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">{group.title}</h2>
          <ul className="space-y-3">
            {group.contacts.map((contact) => (
              <li key={contact.name} className="rounded-2xl border border-border p-3 space-y-1">
                <p className="text-sm text-ink">{contact.name}</p>
                {contact.hours && <p className="text-xs text-muted">{contact.hours}</p>}
                <p className="text-sm">
                  {contact.phones.map((phone, i) => (
                    <span key={phone.tel}>
                      {i > 0 && " · "}
                      <a href={`tel:${phone.tel}`} className={linkClass}>
                        {phone.display}
                      </a>
                    </span>
                  ))}
                </p>
                {contact.email && (
                  <p className="text-xs">
                    <a href={`mailto:${contact.email}`} className={linkClass}>
                      {contact.email}
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[11px] text-dim text-center">
        MindWatch is a university project. It is not medical advice and can't diagnose anything.
      </p>
      <div className="flex justify-between">
        <a href="/privacy.html" target="_blank" rel="noopener" className={linkButtonClass}>
          Privacy
        </a>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
