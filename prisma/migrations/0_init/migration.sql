-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."mcp_clients" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "access_token" TEXT NOT NULL,
    "allow_list" JSONB NOT NULL,

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mcp_servers" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "name" TEXT NOT NULL,
    "transport" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."server_configs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "mode" VARCHAR(12) NOT NULL,
    "initialized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "server_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tool_groups" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "included_tools" JSONB NOT NULL,

    CONSTRAINT "tool_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tools" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "description" TEXT,
    "input_schema" JSONB,
    "server_id" BIGINT NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_mcp_clients_name" ON "public"."mcp_clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uni_mcp_clients_access_token" ON "public"."mcp_clients"("access_token");

-- CreateIndex
CREATE INDEX "idx_mcp_clients_deleted_at" ON "public"."mcp_clients"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_mcp_servers_name" ON "public"."mcp_servers"("name");

-- CreateIndex
CREATE INDEX "idx_mcp_servers_deleted_at" ON "public"."mcp_servers"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_server_configs_deleted_at" ON "public"."server_configs"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uni_tool_groups_name" ON "public"."tool_groups"("name");

-- CreateIndex
CREATE INDEX "idx_tool_groups_deleted_at" ON "public"."tool_groups"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_tools_deleted_at" ON "public"."tools"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uni_users_username" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "uni_users_access_token" ON "public"."users"("access_token");

-- CreateIndex
CREATE INDEX "idx_users_deleted_at" ON "public"."users"("deleted_at");

-- AddForeignKey
ALTER TABLE "public"."tools" ADD CONSTRAINT "fk_tools_server" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

