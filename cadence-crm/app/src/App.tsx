import { Route, Routes } from "react-router-dom";
import { Shell } from "@/components/Shell";
import Dashboard from "@/screens/Dashboard";
import Deals from "@/screens/Deals";
import Contacts from "@/screens/Contacts";
import Organizations from "@/screens/Organizations";
import Leads from "@/screens/Leads";
import Activities from "@/screens/Activities";
import Products from "@/screens/Products";
import Settings from "@/screens/Settings";
import {
  Automations, Calendar, Documents, Forecast, Mailbox, Marketplace, Projects, Reports, Sequences,
} from "@/screens/Phase";

/**
 * Cadence CRM — the sales app.
 *
 * Phases 1–5 are live end to end (dashboard, leads, deals with drag-drop and
 * rotting, contacts, organizations, activities, products) on data shaped exactly
 * like the tested Postgres schema. The remaining nav items carry honest,
 * phase-labelled empty states — no fake buttons (§48).
 */
export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/organizations" element={<Organizations />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/products" element={<Products />} />
        <Route path="/mail" element={<Mailbox />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/sequences" element={<Sequences />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Shell>
  );
}
