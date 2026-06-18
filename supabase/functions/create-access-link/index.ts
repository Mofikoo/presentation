// ============================================
// Edge Function : create-access-link
// ============================================
// Rôle : reçoit depuis le panneau admin le nom de l'animateur et la
// durée de validité souhaitée, génère un token aléatoire sécurisé,
// l'enregistre dans Supabase, et renvoie le lien complet à copier.
//
// IMPORTANT : cette fonction est protégée par un mot de passe admin
// simple (ADMIN_PASSWORD), pour éviter que n'importe qui puisse
// générer des liens s'il tombe sur l'URL de cette fonction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { animatorName, durationHours, adminPassword } = await req.json();

    // Vérification simple du mot de passe admin.
    // Tu définis ce mot de passe comme "secret" de la fonction (voir
    // instructions de déploiement plus bas).
    if (adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
      return new Response(
        JSON.stringify({ error: "Mot de passe incorrect" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!animatorName || !durationHours || durationHours <= 0) {
      return new Response(
        JSON.stringify({ error: "Nom ou durée invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Génère un token long et aléatoire (impossible à deviner).
    const token = crypto.randomUUID() + "-" + crypto.randomUUID();

    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from("access_links")
      .insert({
        token,
        animator_name: animatorName,
        expires_at: expiresAt,
      });

    if (error) {
      return new Response(
        JSON.stringify({ error: "Erreur lors de la création du lien" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        token,
        expiresAt,
        animatorName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});