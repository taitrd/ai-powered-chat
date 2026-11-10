import React, { useState } from "react";
import { AlertCircle, Lock, Mail, KeyRound, X, Loader2, ArrowLeft } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../stores/hooks";
import {
  authModalToggled,
  authErrorSet,
} from "../stores/features/auth/authSlice";
import {
  signIn,
  signUp,
  confirmSignUp,
  forgotPassword,
  confirmForgotPassword,
} from "../stores/features/auth/authThunks";

export const AuthModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((s) => s.auth.authModalOpen);
  const status = useAppSelector((s) => s.auth.status);
  const error = useAppSelector((s) => s.auth.error);

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<"form" | "confirm" | "forgot" | "reset">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");

  if (!isOpen) return null;

  const handleClose = () => {
    dispatch(authModalToggled(false));
    dispatch(authErrorSet(null));
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (tab === "signin") {
      dispatch(signIn(email, password));
    } else {
      const ok = await dispatch(signUp(email, password));
      if (ok) {
        setStep("confirm");
      }
    }
  };

  const handleConfirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    const ok = await dispatch(confirmSignUp(email, code));
    if (ok) {
      setStep("form");
      setTab("signin");
      dispatch(signIn(email, password));
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const ok = await dispatch(forgotPassword(email));
    if (ok) {
      setStep("reset");
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !code || !newPassword) return;
    const ok = await dispatch(confirmForgotPassword(email, code, newPassword));
    if (ok) {
      setStep("form");
      setTab("signin");
      setPassword(newPassword);
      dispatch(signIn(email, newPassword));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-semibold">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-gray-900">
              {step === "confirm"
                ? "Verify Email"
                : step === "forgot"
                  ? "Reset Password"
                  : step === "reset"
                    ? "Set New Password"
                    : tab === "signin"
                      ? "Sign in to AI Chat"
                      : "Create an Account"}
            </h3>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            title="Close"
            disabled={status === "loading"}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        {step === "form" && (
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => {
                setTab("signin");
                dispatch(authErrorSet(null));
              }}
              disabled={status === "loading"}
              className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors disabled:opacity-50 ${
                tab === "signin"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setTab("signup");
                dispatch(authErrorSet(null));
              }}
              disabled={status === "loading"}
              className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors disabled:opacity-50 ${
                tab === "signup"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Forms */}
        {step === "confirm" ? (
          <form onSubmit={handleConfirmCode} className="p-5">
            <fieldset disabled={status === "loading"} className="space-y-4">
              <p className="text-xs text-gray-600">
                We sent a verification code to <strong>{email}</strong>. Enter it
                below to complete registration.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <span>Confirm Account</span>
                )}
              </button>

              <button
                type="button"
                disabled={status === "loading"}
                onClick={() => {
                  setStep("form");
                  dispatch(authErrorSet(null));
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mt-2 disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </fieldset>
          </form>
        ) : step === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="p-5">
            <fieldset disabled={status === "loading"} className="space-y-4">
              <p className="text-xs text-gray-600">
                Enter your email address to receive a verification code to reset your password.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <span>Send Reset Code</span>
                )}
              </button>

              <button
                type="button"
                disabled={status === "loading"}
                onClick={() => {
                  setStep("form");
                  dispatch(authErrorSet(null));
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mt-2 disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </fieldset>
          </form>
        ) : step === "reset" ? (
          <form onSubmit={handleConfirmReset} className="p-5">
            <fieldset disabled={status === "loading"} className="space-y-4">
              <p className="text-xs text-gray-600">
                Enter the verification code sent to <strong>{email}</strong> and choose a new password.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resetting password...</span>
                  </>
                ) : (
                  <span>Reset Password</span>
                )}
              </button>

              <button
                type="button"
                disabled={status === "loading"}
                onClick={() => {
                  setStep("form");
                  dispatch(authErrorSet(null));
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mt-2 disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </fieldset>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-5">
            <fieldset disabled={status === "loading"} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Password
                  </label>
                  {tab === "signin" && (
                    <button
                      type="button"
                      disabled={status === "loading"}
                      onClick={() => {
                        setStep("forgot");
                        dispatch(authErrorSet(null));
                      }}
                      className="text-xs text-brand-600 hover:text-brand-500 font-medium disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {tab === "signin" ? "Signing in..." : "Creating account..."}
                    </span>
                  </>
                ) : (
                  <span>{tab === "signin" ? "Sign In" : "Create Account"}</span>
                )}
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
};
