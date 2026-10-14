export type Role = "admin" | "organizador" | "jogador";
export type RsvpStatus = "vou" | "talvez" | "nao_vou";
export type Surface = "society" | "grama" | "futsal" | "areia" | "outro";
export type PollKind = "data" | "campo" | "jogo" | "livre";

export type Profile = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  active: boolean;
  /** pessoa de teste: só o admin (e outras de teste) enxergam */
  is_test: boolean;
  created_at: string;
};

export type Invite = {
  email: string;
  role: Role;
  name: string | null;
  invited_by: string | null;
  is_test: boolean;
  created_at: string;
};

export type FieldRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  surface: Surface;
  price_per_hour: number | null;
  price_notes: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  other_social: string | null;
  maps_url: string | null;
  google_place_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Game = {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  field_id: string | null;
  max_players: number | null;
  price_total: number | null;
  notes: string | null;
  status: "marcado" | "cancelado";
  created_by: string | null;
  created_at: string;
};

export type GameWithField = Game & {
  field: Pick<FieldRow, "id" | "name" | "address" | "lat" | "lng" | "price_per_hour"> | null;
};

export type Rsvp = { game_id: string; user_id: string; status: RsvpStatus; updated_at: string };

export type Poll = {
  id: string;
  question: string;
  kind: PollKind;
  multiple: boolean;
  closes_at: string | null;
  closed: boolean;
  game_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  starts_at: string | null;
  field_id: string | null;
  /** pergunta extra no fim da votação; nulo = pergunta principal */
  question: string | null;
  position: number;
};

export type PollVote = { option_id: string; poll_id: string; user_id: string; created_at: string };

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  organizador: "Organizador",
  jogador: "Jogador",
};

export const ROLE_HELP: Record<Role, string> = {
  admin: "Dono do sistema. Faz tudo, inclusive mudar papéis e desativar pessoas.",
  organizador: "Marca jogos oficiais, aprova sugestões, abre votações e convida jogadores.",
  jogador: "Confirma presença, vota, cadastra campos e sugere jogos (campo, dia e horário).",
};

export const SURFACE_LABEL: Record<Surface, string> = {
  society: "Society (sintético)",
  grama: "Grama natural",
  futsal: "Quadra / futsal",
  areia: "Areia",
  outro: "Outro",
};

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  vou: "Vou",
  talvez: "Talvez",
  nao_vou: "Não vou",
};

export type SuggestionStatus = "pendente" | "aprovada" | "recusada";

export type Suggestion = {
  id: string;
  field_id: string;
  starts_at: string | null;
  duration_min: number;
  note: string | null;
  status: SuggestionStatus;
  game_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type SuggestionSupport = { suggestion_id: string; user_id: string; created_at: string };
