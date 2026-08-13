-- ARCHÉ — esquema mínimo para persistir indicadores, dossiês e documentos.
-- Importante: valor é MEDIUMTEXT, não TEXT. O dossiê pode exceder 64 KB.

CREATE TABLE IF NOT EXISTS estado (
  id INT NOT NULL AUTO_INCREMENT,
  chave VARCHAR(500) NOT NULL,
  valor MEDIUMTEXT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY estado_chave_unique (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
