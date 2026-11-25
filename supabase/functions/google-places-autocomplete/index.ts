import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const payload = await req.json();
    const query = typeof payload?.input === "string" ? payload.input.trim() : "";

    if (query.length < 2) {
      return Response.json({ suggestions: [] }, { headers: corsHeaders });
    }

    if (query.length > 200) {
      return Response.json(
        { error: "Input is too long" },
        { status: 400, headers: corsHeaders },
      );
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "Google Maps key is not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    const googleResponse = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
        },
        body: JSON.stringify({
          input: query,
          languageCode: "uk",
          regionCode: "UA",
          includedRegionCodes: ["ua"],
        }),
      },
    );

    const data = await googleResponse.json();
    return Response.json(data, {
      status: googleResponse.status,
      headers: corsHeaders,
    });
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400, headers: corsHeaders },
    );
  }
});
