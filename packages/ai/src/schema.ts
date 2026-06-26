// JSON schema the parser constrains Haiku's output to. Keep in sync with the
// CandidateProfile type in @hiredesq/shared. Structured-output schema limits
// apply (no min/max length, additionalProperties must be false) — see claude-api.
export const CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    location: { type: "string" },
    currentTitle: { type: "string" },
    currentCompany: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: ["string", "null"] },
          summary: { type: "string" },
        },
        required: ["company", "title"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          institution: { type: "string" },
          degree: { type: "string" },
          field: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["institution"],
      },
    },
    // Hard-constraint fields for the qualification filter (§2C). Optional — emitted
    // only when the source states them; the model must NOT guess these.
    nationality: { type: "string" },
    residenceTransferable: { type: ["boolean", "null"] },
    licenses: { type: "array", items: { type: "string" } },
  },
  required: ["fullName", "skills", "experience", "education"],
} as const;

export const PARSE_SYSTEM_PROMPT =
  "You extract a structured candidate profile from a resume or messy recruiter " +
  "notes. Return only what is present in the source — never invent contact details, " +
  "employers, or dates. Normalize obvious formatting but do not embellish. Also " +
  "capture, ONLY when explicitly stated: nationality; whether the residence " +
  "permit/visa is transferable (residenceTransferable true/false, else omit); and " +
  "professional licenses or certifications (licenses). Never guess these — omit " +
  "when the source is silent.";
