import { useEffect, useState } from "react";

export default function App() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    try {
      const response = await fetch(
        "http://localhost:8787/api/debt-cases"
      );

      const data = await response.json();

      setCases(data.cases || []);
    } catch (err) {
      console.error(err);
      alert("Failed loading debt cases");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">טוען...</div>;
  }

  return (
    <div className="page">
      <div className="header">
        <h1>מערכת חייבים קארדקום</h1>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-number">
              {cases.length}
            </div>

            <div className="stat-label">
              חייבים פעילים
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>מספר לקוח</th>
              <th>סטטוס</th>
              <th>כשל ראשון</th>
              <th>כשל אחרון</th>
              <th>מספר כשלונות</th>
              <th>4 ספרות</th>
              <th>החליף כרטיס</th>
              <th>סיבה אחרונה</th>
            </tr>
          </thead>

          <tbody>
            {cases.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>

                <td>
                  {item.cardcom_customer_number}
                </td>

                <td>
                  <StatusBadge status={item.status} />
                </td>

                <td>
                  {formatDate(item.first_failed_at)}
                </td>

                <td>
                  {formatDate(item.last_failed_at)}
                </td>

                <td>{item.failure_count}</td>

                <td>{item.current_last4}</td>

                <td>
                  {item.card_replaced
                    ? "✅"
                    : "—"}
                </td>

                <td className="reason">
                  {item.last_failure_reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE_CARD_AUDIT: "במעקב",
    CARD_REPLACE_REQUIRED: "נדרש כרטיס חדש",
    CARD_REPLACED_WAITING_CHARGE:
      "החליף כרטיס",
    CLOSED_SUCCESS: "נסגר",
  };

  return (
    <div className={`status status-${status}`}>
      {map[status] || status}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";

  return value.split(" ")[0];
}