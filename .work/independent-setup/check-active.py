import sys
import asyncio
import json
sys.path.insert(0, 'D:/Downloads/ardberg_framework/backend')
from sqlalchemy import select
from app.db import session_scope
from app.models import Run
from app.config import settings
from temporalio.client import Client

with session_scope() as session:
    active = [(run.id, run.status) for run in session.scalars(
        select(Run).where(Run.status.in_(['running', 'queued', 'reporting'])))]
async def live_workflows():
    client = await Client.connect(settings.temporal_address)
    workflows = []
    async for workflow in client.list_workflows(query='ExecutionStatus="Running"'):
        workflows.append({"id": workflow.id, "type": workflow.workflow_type})
    return workflows

live = asyncio.run(live_workflows())
print(json.dumps({"database_pending_records": len(active), "live_workflows": live}))
sys.exit(1 if live else 0)
