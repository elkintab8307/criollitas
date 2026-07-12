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
      current_rol: { Args: never; Returns: string }
      current_sede_id: { Args: never; Returns: string }
    }
    Enums: {
      rol_usuario: "admin" | "cajera" | "vendedora" | "cocina"
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
      rol_usuario: ["admin", "cajera", "vendedora", "cocina"],
    },
  },
} as const
