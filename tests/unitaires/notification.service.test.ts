import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above these declarations, so the factory can only
// reference variables created via `vi.hoisted` — a plain top-level `const`
// (even named `mockXxx`) hits a temporal-dead-zone ReferenceError instead.
const { mockTrouverParId, mockMettreAJourPushToken } = vi.hoisted(() => ({
  mockTrouverParId: vi.fn(),
  mockMettreAJourPushToken: vi.fn(),
}));

vi.mock("../../src/repositories/personne.repository.js", () => ({
  trouverParId: mockTrouverParId,
  mettreAJourPushToken: mockMettreAJourPushToken,
}));

import { envoyerNotificationPush } from "../../src/services/notification.service.js";

function reponseFictive(corps: unknown, ok = true): Response {
  // `Promise.resolve` plutôt que des méthodes `async` : la règle require-await
  // d'ESLint refuse une fonction `async` sans `await`, et un stub renvoyant une
  // valeur brute ne ressemblerait plus assez à `Response` pour que le cast
  // passe. La double conversion via `unknown` reste nécessaire — ce stub ne
  // couvre que les deux méthodes utilisées, pas les douze autres.
  return {
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(JSON.stringify(corps)),
    json: () => Promise.resolve(corps),
  } as unknown as Response;
}

describe("envoyerNotificationPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne fait aucun appel réseau si la personne n'a pas de token enregistré", async () => {
    mockTrouverParId.mockResolvedValue({ expoPushToken: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resultat = await envoyerNotificationPush("p1", "Titre", "Corps");

    expect(resultat).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie la notification et renvoie true sur un ticket ok", async () => {
    mockTrouverParId.mockResolvedValue({ expoPushToken: "ExponentPushToken[abc]" });
    const fetchMock = vi.fn().mockResolvedValue(reponseFictive({ data: { status: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);

    const resultat = await envoyerNotificationPush("p1", "Titre", "Corps", { type: "test" });

    expect(resultat).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const corpsEnvoye = JSON.parse((options as RequestInit).body as string);
    expect(corpsEnvoye).toMatchObject({
      to: "ExponentPushToken[abc]",
      title: "Titre",
      body: "Corps",
      data: { type: "test" },
    });
    expect(mockMettreAJourPushToken).not.toHaveBeenCalled();
  });

  it("efface le token si Expo répond DeviceNotRegistered", async () => {
    mockTrouverParId.mockResolvedValue({ expoPushToken: "ExponentPushToken[perime]" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reponseFictive({
          data: { status: "error", message: "expiré", details: { error: "DeviceNotRegistered" } },
        }),
      ),
    );

    const resultat = await envoyerNotificationPush("p1", "Titre", "Corps");

    expect(resultat).toBe(false);
    expect(mockMettreAJourPushToken).toHaveBeenCalledWith("p1", null);
  });

  it("ne touche pas au token pour une erreur Expo qui n'est pas DeviceNotRegistered", async () => {
    mockTrouverParId.mockResolvedValue({ expoPushToken: "ExponentPushToken[abc]" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reponseFictive({
          data: {
            status: "error",
            message: "throttled",
            details: { error: "MessageRateExceeded" },
          },
        }),
      ),
    );

    const resultat = await envoyerNotificationPush("p1", "Titre", "Corps");

    expect(resultat).toBe(false);
    expect(mockMettreAJourPushToken).not.toHaveBeenCalled();
  });

  it("renvoie false sans lever si l'appel réseau échoue", async () => {
    mockTrouverParId.mockResolvedValue({ expoPushToken: "ExponentPushToken[abc]" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const resultat = await envoyerNotificationPush("p1", "Titre", "Corps");

    expect(resultat).toBe(false);
  });
});
