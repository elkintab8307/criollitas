export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anulaciones: {
        Row: {
          creado_en: string
          id: string
          motivo: string
          pedido_id: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          motivo: string
          pedido_id: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          motivo?: string
          pedido_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anulaciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anulaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          creado_en: string
          diff_json: Json
          id: string
          registro_id: string
          sede_id: string | null
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          diff_json: Json
          id?: string
          registro_id: string
          sede_id?: string | null
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          diff_json?: Json
          id?: string
          registro_id?: string
          sede_id?: string | null
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          creado_en: string
          id: string
          imagen_url: string | null
          nombre: string
          orden: number
          sede_id: string
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          id?: string
          imagen_url?: string | null
          nombre: string
          orden?: number
          sede_id: string
        }
        Update: {
          activa?: boolean
          creado_en?: string
          id?: string
          imagen_url?: string | null
          nombre?: string
          orden?: number
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_domicilio: {
        Row: {
          creado_en: string
          direccion: string
          id: string
          nombre: string
          notas: string | null
          referencia: string | null
          sede_id: string
          telefono: string
        }
        Insert: {
          creado_en?: string
          direccion: string
          id?: string
          nombre: string
          notas?: string | null
          referencia?: string | null
          sede_id: string
          telefono: string
        }
        Update: {
          creado_en?: string
          direccion?: string
          id?: string
          nombre?: string
          notas?: string | null
          referencia?: string | null
          sede_id?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_domicilio_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      impresiones: {
        Row: {
          contenido_escpos: string
          creado_en: string
          enviado_en: string | null
          error: string | null
          exito: boolean | null
          id: string
          pedido_id: string
          tipo: string
        }
        Insert: {
          contenido_escpos: string
          creado_en?: string
          enviado_en?: string | null
          error?: string | null
          exito?: boolean | null
          id?: string
          pedido_id: string
          tipo: string
        }
        Update: {
          contenido_escpos?: string
          creado_en?: string
          enviado_en?: string | null
          error?: string | null
          exito?: boolean | null
          id?: string
          pedido_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "impresiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas: {
        Row: {
          activa: boolean
          capacidad: number
          creado_en: string
          estado: Database["public"]["Enums"]["estado_mesa"]
          id: string
          nombre: string
          numero: number
          sede_id: string
        }
        Insert: {
          activa?: boolean
          capacidad?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mesa"]
          id?: string
          nombre: string
          numero: number
          sede_id: string
        }
        Update: {
          activa?: boolean
          capacidad?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mesa"]
          id?: string
          nombre?: string
          numero?: number
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      modificadores: {
        Row: {
          activo: boolean
          grupo: string | null
          id: string
          max_seleccion: number
          nombre: string
          obligatorio: boolean
          precio_delta_cop: number
          producto_id: string
        }
        Insert: {
          activo?: boolean
          grupo?: string | null
          id?: string
          max_seleccion?: number
          nombre: string
          obligatorio?: boolean
          precio_delta_cop?: number
          producto_id: string
        }
        Update: {
          activo?: boolean
          grupo?: string | null
          id?: string
          max_seleccion?: number
          nombre?: string
          obligatorio?: boolean
          precio_delta_cop?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modificadores_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja: {
        Row: {
          concepto: string
          creado_en: string
          id: string
          monto_cop: number
          tipo: Database["public"]["Enums"]["tipo_movimiento_caja"]
          turno_id: string
        }
        Insert: {
          concepto: string
          creado_en?: string
          id?: string
          monto_cop: number
          tipo: Database["public"]["Enums"]["tipo_movimiento_caja"]
          turno_id: string
        }
        Update: {
          concepto?: string
          creado_en?: string
          id?: string
          monto_cop?: number
          tipo?: Database["public"]["Enums"]["tipo_movimiento_caja"]
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          creado_en: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_cop: number
          pedido_id: string
          referencia: string | null
          turno_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_cop: number
          pedido_id: string
          referencia?: string | null
          turno_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_cop?: number
          pedido_id?: string
          referencia?: string | null
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_item_mods: {
        Row: {
          id: string
          modificador_id: string
          pedido_item_id: string
          precio_delta_cop: number
        }
        Insert: {
          id?: string
          modificador_id: string
          pedido_item_id: string
          precio_delta_cop: number
        }
        Update: {
          id?: string
          modificador_id?: string
          pedido_item_id?: string
          precio_delta_cop?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_item_mods_modificador_id_fkey"
            columns: ["modificador_id"]
            isOneToOne: false
            referencedRelation: "modificadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_mods_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          estado_item: Database["public"]["Enums"]["estado_item_pedido"]
          id: string
          notas: string | null
          pedido_id: string
          precio_unit_cop: number
          producto_id: string
          subtotal_cop: number
          tiempo_listo_en: string | null
        }
        Insert: {
          cantidad: number
          estado_item?: Database["public"]["Enums"]["estado_item_pedido"]
          id?: string
          notas?: string | null
          pedido_id: string
          precio_unit_cop: number
          producto_id: string
          subtotal_cop: number
          tiempo_listo_en?: string | null
        }
        Update: {
          cantidad?: number
          estado_item?: Database["public"]["Enums"]["estado_item_pedido"]
          id?: string
          notas?: string | null
          pedido_id?: string
          precio_unit_cop?: number
          producto_id?: string
          subtotal_cop?: number
          tiempo_listo_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          canal: Database["public"]["Enums"]["canal_pedido"]
          cerrado_en: string | null
          cliente_id: string | null
          creado_en: string
          descuento_cop: number
          enviado_cocina_en: string | null
          estado: Database["public"]["Enums"]["estado_pedido"]
          id: string
          mesa_id: string | null
          notas: string | null
          numero_corto: number
          propina_cop: number
          sede_id: string
          subtotal_cop: number
          total_cop: number
          vendedora_id: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_pedido"]
          cerrado_en?: string | null
          cliente_id?: string | null
          creado_en?: string
          descuento_cop?: number
          enviado_cocina_en?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido"]
          id?: string
          mesa_id?: string | null
          notas?: string | null
          numero_corto: number
          propina_cop?: number
          sede_id: string
          subtotal_cop?: number
          total_cop?: number
          vendedora_id: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_pedido"]
          cerrado_en?: string | null
          cliente_id?: string | null
          creado_en?: string
          descuento_cop?: number
          enviado_cocina_en?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido"]
          id?: string
          mesa_id?: string | null
          notas?: string | null
          numero_corto?: number
          propina_cop?: number
          sede_id?: string
          subtotal_cop?: number
          total_cop?: number
          vendedora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_domicilio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_intentos: {
        Row: {
          creado_en: string
          exito: boolean
          id: number
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          exito: boolean
          id?: never
          usuario_id: string
        }
        Update: {
          creado_en?: string
          exito?: boolean
          id?: never
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_intentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_id: string
          creado_en: string
          descripcion: string | null
          es_combo: boolean
          id: string
          imagen_url: string | null
          nombre: string
          precio_cop: number
          sede_id: string
          tiempo_prep_min: number | null
        }
        Insert: {
          activo?: boolean
          categoria_id: string
          creado_en?: string
          descripcion?: string | null
          es_combo?: boolean
          id?: string
          imagen_url?: string | null
          nombre: string
          precio_cop: number
          sede_id: string
          tiempo_prep_min?: number | null
        }
        Update: {
          activo?: boolean
          categoria_id?: string
          creado_en?: string
          descripcion?: string | null
          es_combo?: boolean
          id?: string
          imagen_url?: string | null
          nombre?: string
          precio_cop?: number
          sede_id?: string
          tiempo_prep_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      sedes: {
        Row: {
          activa: boolean
          creado_en: string
          direccion: string | null
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          activa?: boolean
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      turnos_caja: {
        Row: {
          abierto_en: string
          cajera_id: string
          cerrado_en: string | null
          diferencia_cop: number | null
          efectivo_declarado_cop: number | null
          efectivo_inicial_cop: number
          esperado_cop: number | null
          estado: Database["public"]["Enums"]["estado_turno"]
          id: string
          notas: string | null
          sede_id: string
        }
        Insert: {
          abierto_en?: string
          cajera_id: string
          cerrado_en?: string | null
          diferencia_cop?: number | null
          efectivo_declarado_cop?: number | null
          efectivo_inicial_cop: number
          esperado_cop?: number | null
          estado?: Database["public"]["Enums"]["estado_turno"]
          id?: string
          notas?: string | null
          sede_id: string
        }
        Update: {
          abierto_en?: string
          cajera_id?: string
          cerrado_en?: string | null
          diferencia_cop?: number | null
          efectivo_declarado_cop?: number | null
          efectivo_inicial_cop?: number
          esperado_cop?: number | null
          estado?: Database["public"]["Enums"]["estado_turno"]
          id?: string
          notas?: string | null
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_cajera_id_fkey"
            columns: ["cajera_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_caja_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          avatar_url: string | null
          creado_en: string
          id: string
          nombre: string
          pin_hash: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          sede_id: string
        }
        Insert: {
          activo?: boolean
          avatar_url?: string | null
          creado_en?: string
          id: string
          nombre: string
          pin_hash?: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          sede_id: string
        }
        Update: {
          activo?: boolean
          avatar_url?: string | null
          creado_en?: string
          id?: string
          nombre?: string
          pin_hash?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_estado_item_pedido: {
        Args: {
          p_nuevo_estado: Database["public"]["Enums"]["estado_item_pedido"]
          p_pedido_item_id: string
        }
        Returns: undefined
      }
      anular_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: undefined
      }
      cerrar_turno: {
        Args: { p_efectivo_declarado_cop: number; p_turno_id: string }
        Returns: undefined
      }
      cobrar_pedido: {
        Args: { p_pagos: Json; p_pedido_id: string; p_turno_id: string }
        Returns: undefined
      }
      current_rol: { Args: never; Returns: string }
      current_sede_id: { Args: never; Returns: string }
      recalcular_totales_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
    }
    Enums: {
      canal_pedido: "mesa" | "domicilio" | "llevar"
      estado_item_pedido: "pendiente" | "en_preparacion" | "listo" | "entregado"
      estado_mesa: "libre" | "ocupada" | "reservada"
      estado_pedido:
        | "abierto"
        | "enviado_cocina"
        | "en_preparacion"
        | "listo"
        | "entregado"
        | "cobrado"
        | "cerrado"
        | "anulado"
      estado_turno: "abierto" | "cerrado"
      metodo_pago:
        | "efectivo"
        | "nequi"
        | "daviplata"
        | "bancolombia_qr"
        | "datafono"
        | "otro"
      rol_usuario: "admin" | "cajera" | "vendedora" | "cocina"
      tipo_movimiento_caja: "retiro" | "gasto" | "ingreso_extra"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      canal_pedido: ["mesa", "domicilio", "llevar"],
      estado_item_pedido: ["pendiente", "en_preparacion", "listo", "entregado"],
      estado_mesa: ["libre", "ocupada", "reservada"],
      estado_pedido: [
        "abierto",
        "enviado_cocina",
        "en_preparacion",
        "listo",
        "entregado",
        "cobrado",
        "cerrado",
        "anulado",
      ],
      estado_turno: ["abierto", "cerrado"],
      metodo_pago: [
        "efectivo",
        "nequi",
        "daviplata",
        "bancolombia_qr",
        "datafono",
        "otro",
      ],
      rol_usuario: ["admin", "cajera", "vendedora", "cocina"],
      tipo_movimiento_caja: ["retiro", "gasto", "ingreso_extra"],
    },
  },
} as const
