export type ProjectStatus = "ativo" | "concluido" | "cancelado";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  contract_number: string | null;
  name: string;
  responsible_user_id: string | null;
  status: ProjectStatus;
  briefing_date: string | null;
  presentation_date: string | null;
  contract_signed_date: string | null;
  measurement_date: string | null;
  technical_book_due_date: string | null;
  technical_book_revision_date: string | null;
  technical_book_signed_date: string | null;
  delivery_date: string | null;
  assembly_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  clients?: Pick<Client, "id" | "name"> | null;
}
