import { redirect } from "next/navigation";

// Rota antiga do login — mantida só como redirecionamento pra /entrar, pra
// links e favoritos antigos (e redirects de /acesso e /c) continuarem
// funcionando.
export default function LoginRedirectPage() {
  redirect("/entrar");
}
