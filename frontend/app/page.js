"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState("employee");

  function handleLogin(e) {
    e.preventDefault();

    const id = employeeId.trim();
    if (!id) return;

    router.push(
      `/${role}?employee_id=${encodeURIComponent(id)}`
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-8 w-fit text-center">

  <h1 className="bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-700 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
    Workplace Efficiency
  </h1>

  <p className="mt-2 text-sm text-slate-500 sm:text-base">
    Insights that turn workplace data into better decisions
  </p>


          <p className="mt-2 text-sm text-slate-500">
            Enter your details to access your dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="employeeId"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Employee ID
            </label>

            <input
              id="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Enter employee ID, e.g. E001"
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Dashboard
            </label>

            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Open Dashboard →
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">
          Employee Analytics Portal
        </p>
      </div>
    </main>
  );
}
