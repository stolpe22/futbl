/** Converte erros técnicos em mensagens claras, dizendo o que fazer (heurística 9) */
export function friendlyError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  const m = raw.toLowerCase();

  if (m.includes("invalid input value for enum") || (m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"))) || m.includes("could not find the function"))
    return "O banco está desatualizado para esta versão do app. O admin precisa rodar de novo o supabase/schema.sql no Supabase (SQL Editor).";
  if (m.includes("conflito_horario")) {
    const place = raw.split(/CONFLITO_HORARIO:\s*/i)[1]?.trim();
    return `Você já confirmou outro jogo nesse horário${place ? ` (${place})` : ""}. Lá, troque para “Não vou” antes de confirmar este.`;
  }
  if (raw === "SIMULACAO")
    return "Você está só vendo como outra pessoa: nada é salvo. Toque em “Sair da simulação” para fazer isso de verdade.";
  if (m.includes("email_nao_convidado") || m.includes("database error saving new user"))
    return "Esse email não está na lista do grupo. Peça para um organizador te cadastrar e tente de novo.";
  if (m.includes("invalid login credentials"))
    return "Email ou senha incorretos. Confira e tente de novo, ou use “Esqueci a senha”.";
  if (m.includes("email not confirmed"))
    return "Você ainda não confirmou seu email. Abra o link que enviamos (olhe também o spam).";
  if (m.includes("sugestao_passado")) return "Esse dia e horário já passaram. Escolha uma data no futuro.";
  if (m.includes("signups not allowed"))
    return "Você ainda não criou sua conta. Use “Primeiro acesso” na tela de entrar.";
  if (m.includes("user already registered"))
    return "Esse email já tem conta. Use a aba “Entrar” ou “Esqueci a senha”.";
  if (m.includes("password should") || m.includes("weak password"))
    return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  if (m.includes("same_password") || m.includes("different from the old"))
    return "A nova senha precisa ser diferente da atual.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (m.includes("só o admin")) return "Só o admin pode mudar o papel ou desativar alguém.";
  if (m.includes("não pode tirar seu próprio")) return "Você não pode tirar seu próprio acesso de admin.";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "Você não tem permissão para isso. Fale com um organizador se achar que deveria ter.";
  if (m.includes("duplicate key") && m.includes("invites")) return "Esse email já foi convidado.";
  if (m.includes("duplicate key")) return "Isso já está cadastrado.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
  if (m.includes("jwt") || m.includes("session"))
    return "Sua sessão expirou. Entre de novo para continuar.";
  if ((m.includes("relation") && m.includes("does not exist")) || m.includes("could not find the table"))
    return "O banco ainda não foi configurado. O admin precisa rodar supabase/schema.sql no Supabase.";
  return raw ? `Algo deu errado: ${raw}` : "Algo deu errado. Tente de novo.";
}
