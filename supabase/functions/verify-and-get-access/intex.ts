// ============================================
// Edge Function : verify-and-get-access
// ============================================
// Rôle : reçoit un token depuis la page animateur, vérifie qu'il est
// valide (existe + pas expiré) et renvoie :
//   - le nom de l'animateur (pour le watermark)
//   - une URL signée vers la vidéo, valable 10 minutes seulement
//   - les URLs signées vers chaque image du PDF, valables 10 minutes
//
// Cette fonction tourne sur les serveurs Supabase, jamais dans le
// navigateur. C'est ici, et seulement ici, qu'on utilise la clé secrète.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Combien de temps les URLs signées restent valides (en secondes).
// 10 minutes suffit largement pour charger une vidéo de présentation,
// et limite la fenêtre si jamais une URL signée fuitait.
const SIGNED_URL_EXPIRY_SECONDS = 600;

// Nombre de pages du PDF (à ajuster une fois le PDF converti en images,
// voir étape suivante). Exemple : si ton PDF a 8 pages.
const PDF_PAGE_COUNT = 8;

Deno.serve(async (req) => {
  // Permet les appels depuis n'importe quel domaine (ton site).
  // Tu peux restreindre à ton domaine précis une fois en prod.
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token manquant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client Supabase avec la clé SECRÈTE (service role) — uniquement
    // disponible ici, côté serveur, jamais dans le navigateur.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifie le token via la fonction SQL créée à l'étape 1.
    const { data, error } = await supabase
      .rpc("verify_access_token", { p_token: token })
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Lien invalide" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data.is_valid) {
      return new Response(
        JSON.stringify({ error: "Ce lien a expiré" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Token valide : on génère les URLs signées temporaires.

    // 1. URL signée vers la vidéo
    const { data: videoUrlData, error: videoError } = await supabase
      .storage
      .from("restricted-content")
      .createSignedUrl("presentation-video.mp4", SIGNED_URL_EXPIRY_SECONDS);

    if (videoError) {
      return new Response(
        JSON.stringify({ error: "Erreur génération vidéo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. URLs signées vers chaque page du PDF (converties en images)
    const pdfPageUrls: string[] = [];
    for (let i = 1; i <= PDF_PAGE_COUNT; i++) {
      const { data: pageUrlData, error: pageError } = await supabase
        .storage
        .from("restricted-content")
        .createSignedUrl(`presentation-pdf/page-${i}.jpg`, SIGNED_URL_EXPIRY_SECONDS);

      if (!pageError && pageUrlData) {
        pdfPageUrls.push(pageUrlData.signedUrl);
      }
    }

    return new Response(
      JSON.stringify({
        animatorName: data.animator_name,
        expiresAt: data.expires_at,
        videoUrl: videoUrlData.signedUrl,
        pdfPageUrls: pdfPageUrls,
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