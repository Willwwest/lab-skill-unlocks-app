// Notices for the signed-in coach (outbox.js): schedule published, covers
// needed, requests decided, and for managers, requests waiting on them.
import React from "react";
import { Bell } from "lucide-react";
import { Button, Card, CardHead } from "./ds/index.jsx";
import { applyOutbox, unread } from "./outbox.js";
import { clockTime } from "./coachkit.jsx";

const SHOW = 5;

export default function Inbox({ ops }) {
  const { state, me } = ops;
  const list = unread(state, me.id, { manager: !!me.head });
  if (!list.length) return null;
  const read = (ids, msg) =>
    ops.run(msg, (s) => applyOutbox(s, { actor: ops.actor, ids }, ops.now));
  return (
    <Card className="ib">
      <CardHead
        title={
          <span className="ib-title">
            <Bell size={18} aria-hidden="true" /> {list.length} new
          </span>
        }
        aside={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              read(
                list.map((n) => n.id),
                null,
              )
            }
          >
            Mark all read
          </Button>
        }
      />
      <ul className="ib-list">
        {list.slice(0, SHOW).map((n) => (
          <li key={n.id}>
            <span>{n.text}</span>
            <small>{clockTime(n.at)}</small>
          </li>
        ))}
      </ul>
      {list.length > SHOW && (
        <p className="ds-note">And {list.length - SHOW} more.</p>
      )}
    </Card>
  );
}
