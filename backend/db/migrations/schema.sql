-- =============================================================
-- YoRHa-HexFlow Database Schema
-- Target: MySQL 8.0+ / InnoDB
-- Charset: utf8mb4
-- =============================================================

-- 1. 算子模板定义表 (Operator Templates)
-- 必须最先创建，因为 instruction_fields.op_code 逻辑上引用此表
CREATE TABLE IF NOT EXISTS `operator_templates` (
  `op_code` varchar(32) NOT NULL COMMENT '算子唯一标识 (如: SCALED_DECIMAL)',
  `name` varchar(64) NOT NULL COMMENT '算子显示名称',
  `category` varchar(32) NOT NULL COMMENT '分类: BASE, NUMERIC, DYNAMIC, LOGIC, STRUCT',
  `param_template` json NOT NULL COMMENT 'UI 渲染参数模板 (如: {"factor": "number"})',
  `description` varchar(255) DEFAULT NULL COMMENT '算子功能简述',
  PRIMARY KEY (`op_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='算子模板定义表';

-- 2. 指令定义主表 (Instructions)
CREATE TABLE IF NOT EXISTS `instructions` (
  `id` char(36) NOT NULL COMMENT 'UUID 主键',
  `device_code` varchar(32) NOT NULL COMMENT '设备代号 (如: ROBOT_ARM_V1)，用于区分指令集',
  `code` varchar(64) NOT NULL COMMENT '指令代号 (如: CMD_MOVE)，同一设备下唯一',
  `name` varchar(128) NOT NULL COMMENT '指令显示名称',
  `type` varchar(32) DEFAULT 'DYNAMIC' COMMENT 'STATIC/DYNAMIC',
  `description` text COMMENT '功能描述',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_code_code` (`device_code`,`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指令定义主表';

-- 3. 指令字段结构表 (Instruction Fields)
-- 依赖 instructions 表，必须在其之后创建
CREATE TABLE IF NOT EXISTS `instruction_fields` (
  `id` char(36) NOT NULL COMMENT 'UUID 主键',
  `instruction_id` char(36) NOT NULL COMMENT '关联指令 ID',
  `parent_id` char(36) DEFAULT NULL COMMENT '父字段 ID (嵌套结构)',
  `sequence` int NOT NULL DEFAULT '0' COMMENT '排序',
  `name` varchar(64) NOT NULL COMMENT '字段名称',
  `op_code` varchar(32) NOT NULL COMMENT '关联 operator_templates.op_code',
  `byte_len` int DEFAULT '0' COMMENT '字节长度',
  `endianness` varchar(16) DEFAULT 'BIG' COMMENT 'BIG/LITTLE',
  `repeat_type` varchar(16) DEFAULT 'NONE' COMMENT 'NONE, FIXED, DYNAMIC',
  `repeat_ref_id` char(36) DEFAULT NULL COMMENT 'DYNAMIC计数引用ID',
  `repeat_count` int DEFAULT '1' COMMENT 'FIXED重复次数',
  `parameter_config` json DEFAULT NULL COMMENT '算子具体参数',
  PRIMARY KEY (`id`),
  KEY `idx_inst_seq` (`instruction_id`,`sequence`),
  CONSTRAINT `fk_field_inst` FOREIGN KEY (`instruction_id`) REFERENCES `instructions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指令字段结构表';
