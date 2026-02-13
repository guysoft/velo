import { useState } from "react";
import { startOAuthFlow } from "@/services/gmail/auth";
import { insertAccount } from "@/services/db/accounts";
import { getClientId, getClientSecret } from "@/services/gmail/tokenManager";
import { useAccountStore } from "@/stores/accountStore";
import { Modal } from "@/components/ui/Modal";
import { SetupClientId } from "./SetupClientId";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";
import { Copy, Check, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface AddAccountProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAccount({ onClose, onSuccess }: AddAccountProps) {
  const [status, setStatus] = useState<
    "idle" | "checking" | "authenticating" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const addAccount = useAccountStore((s) => s.addAccount);

  const handleCopyUrl = async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text in a temporary input
      const input = document.createElement("input");
      input.value = authUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenUrl = async () => {
    if (!authUrl) return;
    try {
      await openUrl(authUrl);
    } catch {
      // If openUrl fails again, user can still copy the URL
      console.warn("Failed to open URL in browser");
    }
  };

  const handleAddAccount = async () => {
    setStatus("checking");
    setError(null);
    setAuthUrl(null);
    setCopied(false);

    try {
      const clientId = await getClientId();
      const clientSecret = await getClientSecret();
      setStatus("authenticating");

      const { tokens, userInfo } = await startOAuthFlow(
        clientId,
        clientSecret,
        (url) => setAuthUrl(url),
      );

      const accountId = crypto.randomUUID();
      const expiresAt = getCurrentUnixTimestamp() + tokens.expires_in;

      await insertAccount({
        id: accountId,
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        tokenExpiresAt: expiresAt,
      });

      addAccount({
        id: accountId,
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
        isActive: true,
      });

      onSuccess();
    } catch (err) {
      console.error("Add account error:", err);
      const message =
        err instanceof Error ? err.message : String(err);
      if (message.includes("Client ID not configured")) {
        setNeedsSetup(true);
      } else {
        setError(message);
        setStatus("error");
      }
    }
  };

  if (needsSetup) {
    return (
      <SetupClientId
        onComplete={() => {
          setNeedsSetup(false);
          setStatus("idle");
        }}
        onCancel={onClose}
      />
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Add Gmail Account" width="w-full max-w-md">
      <div className="p-4">
        <p className="text-text-secondary text-sm mb-6">
          Sign in with your Google account to connect it to Velo.
        </p>

        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
            {error}
          </div>
        )}

        {status === "authenticating" && (
          <div className="py-4 text-text-secondary text-sm">
            <div className="text-center mb-2">Waiting for Google sign-in...</div>
            <div className="text-center text-xs text-text-tertiary mb-3">
              Complete the sign-in in your browser, then return here.
            </div>

            {authUrl && (
              <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 mt-3">
                <div className="text-xs text-text-tertiary mb-2">
                  If your browser didn't open, copy this URL and paste it in your browser:
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 text-xs font-mono bg-bg-tertiary rounded px-2 py-1.5 text-text-secondary truncate select-all">
                    {authUrl}
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    className="shrink-0 p-1.5 rounded hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                    title="Copy URL"
                  >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={handleOpenUrl}
                    className="shrink-0 p-1.5 rounded hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                    title="Try opening in browser"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddAccount}
            disabled={status === "authenticating" || status === "checking"}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "authenticating"
              ? "Waiting..."
              : status === "checking"
                ? "Checking..."
                : "Sign in with Google"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
