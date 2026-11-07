"""Service Health Monitoring Service.

Checks the health of all backend services (PostgreSQL, Redis, MinIO)
and returns aggregated status information.

Usage
~~~~~

    from app.services.service_health import service_health_service
    status = await service_health_service.check_all_services()
"""

import asyncio
from typing import Any, Dict

from app.config import settings
from app.database import engine


class ServiceHealthService:
    """Service for monitoring backend service health."""

    async def check_database(self) -> Dict[str, Any]:
        """Check PostgreSQL database connectivity.

        Returns:
            Dictionary with 'healthy' boolean and 'message'.
        """
        try:
            async with engine.connect() as conn:
                await conn.execute(engine.raw_connection().cursor().execute("SELECT 1"))
            return {"healthy": True, "message": "Database connected"}
        except Exception as e:
            return {"healthy": False, "message": str(e)}

    async def check_redis(self) -> Dict[str, Any]:
        """Check Redis connectivity.

        Returns:
            Dictionary with 'healthy' boolean and 'message'.
        """
        try:
            import redis
            r = redis.from_url("redis://localhost:6379/0", socket_timeout=2)
            r.ping()
            return {"healthy": True, "message": "Redis connected"}
        except Exception as e:
            return {"healthy": False, "message": str(e)}

    async def check_minio(self) -> Dict[str, Any]:
        """Check MinIO object storage connectivity.

        Returns:
            Dictionary with 'healthy' boolean and 'message'.
        """
        try:
            from minio import Minio
            client = Minio(
                "localhost:9000",
                access_key="minioadmin",
                secret_key="minioadmin",
                secure=False,
            )
            client.bucket_exists("eisenhower")
            return {"healthy": True, "message": "MinIO connected"}
        except Exception as e:
            return {"healthy": False, "message": str(e)}

    async def check_all_services(self) -> Dict[str, Any]:
        """Check all backend services and return aggregated status.

        Returns:
            Dictionary containing:
            - overall_healthy: True if all services are healthy.
            - services: Dictionary of individual service statuses.
        """
        results = await asyncio.gather(
            self.check_database(),
            self.check_redis(),
            self.check_minio(),
        )

        services = {
            "database": results[0],
            "redis": results[1],
            "minio": results[2],
        }

        overall = all(s["healthy"] for s in services.values())

        return {
            "overall_healthy": overall,
            "services": services,
        }

    async def get_service_status(self) -> Dict[str, Any]:
        """Get a summary of service status.

        Returns:
            Dictionary with service count and health summary.
        """
        status = await self.check_all_services()
        healthy_count = sum(1 for s in status["services"].values() if s["healthy"])
        total_count = len(status["services"])

        return {
            "healthy_services": healthy_count,
            "total_services": total_count,
            "overall_healthy": status["overall_healthy"],
        }


service_health_service = ServiceHealthService()
