import uuid
import datetime

class ConversationMemory:
    def __init__(self, db_manager, user_id, thread_id=None):
        self.db = db_manager
        self.user_id = user_id
        self.thread_id = thread_id or str(uuid.uuid4())
        self._ensure_user_and_thread()

    def _ensure_user_and_thread(self):
        with self.db.pg.cursor() as cur:
            cur.execute("INSERT INTO users (user_id) VALUES (%s) ON CONFLICT DO NOTHING", (self.user_id,))
            cur.execute("""
                INSERT INTO threads (thread_id, user_id, title) 
                VALUES (%s, %s, 'New Conversation') ON CONFLICT DO NOTHING
            """, (self.thread_id, self.user_id))

    def get_working_context(self):
        """Fetches shared profile + last 3 turns from MongoDB."""
        # Shared context (Postgres)
        with self.db.pg.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT key, value FROM shared_memory WHERE user_id = %s", (self.user_id,))
            shared_memory = {row['key']: row['value'] for row in cur.fetchall()}

        with self.db.pg.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT key, value FROM thread_memory WHERE thread_id = %s", (self.thread_id,))
            thread_memory = {row['key']: row['value'] for row in cur.fetchall()}

        # History context (MongoDB)
        history_doc = self.db.mongo["history"].find_one({"thread_id": self.thread_id})
        history = history_doc.get("turns", [])[-5:] if history_doc else []

        return {"shared_memory": shared_memory, "thread_memory": thread_memory, "history": history}

    def fetch_entire_history(self):
        """Fetches the entire conversation history from MongoDB."""
        history_doc = self.db.mongo["history"].find_one({"thread_id": self.thread_id})
        return history_doc.get("turns", []) if history_doc else []

    def save_to_memory(self, key, value, shared=False):
        """Saves a key-value pair to either shared or thread memory in Postgres."""
        table = "shared_memory" if shared else "thread_memory"
        id_field = "user_id" if shared else "thread_id"
        id_value = self.user_id if shared else self.thread_id

        with self.db.pg.cursor() as cur:
            cur.execute(f"""
                INSERT INTO {table} ({id_field}, key, value) 
                VALUES (%s, %s, %s) 
                ON CONFLICT ({id_field}, key) DO UPDATE SET value = EXCLUDED.value
            """, (id_value, key, value))
            
    def save_turn(self, query, result):
        """Saves turn to Mongo and updates PG timestamp."""
        self.db.mongo["history"].update_one(
            {"thread_id": self.thread_id},
            {"$push": {"turns": {"query": query, "analysis": result, "ts": datetime.datetime.utcnow()}}},
            upsert=True
        )
        with self.db.pg.cursor() as cur:
            cur.execute("UPDATE threads SET last_active = CURRENT_TIMESTAMP WHERE thread_id = %s", (self.thread_id,))
