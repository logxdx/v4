import DecryptedText from "@components/reactbits/DecryptedText";

const ROLES = ["Software", "AI Engineer", "mentor", "student", "minimalist"];

export default function RoleLine() {
  return (
    <p>
      {ROLES.map((role, i) => (
        <span key={role}>
          <em>
            <b>
              <DecryptedText
                text={role}
                animateOn="inViewHover"
                sequential
                revealDirection="start"
                speed={40}
                encryptedClassName="opacity-50"
              />
            </b>
          </em>
          {i === 0 ? " & " : i < ROLES.length - 1 ? ", " : "."}
        </span>
      ))}
    </p>
  );
}
