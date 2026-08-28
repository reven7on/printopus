"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Не удалось войти.");
      router.push("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти.");
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link className="admin-login-brand" href="/" aria-label="На главную страницу Принтопус">
          <Image src="/logo.webp" alt="" width={48} height={48} priority />
          <strong>ПРИНТОПУС</strong>
        </Link>
        <div className="admin-login-heading">
          <span className="admin-kicker">Служебный раздел</span>
          <h1 id="admin-login-title">Вход для менеджера</h1>
          <p>Заказы, статусы и цены доступны только авторизованным сотрудникам.</p>
        </div>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>
            <span>Логин</span>
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label>
            <span>Пароль</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? "Проверяем…" : "Войти в админку"}</button>
        </form>
        <Link className="admin-back-link" href="/">← Вернуться на сайт</Link>
      </section>
    </main>
  );
}
