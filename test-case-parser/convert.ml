(* This file is part of the Catala project. Copyright (C) 2024 Inria.

   Licensed under the Apache License, Version 2.0 (the "License"); you may not
   use this file except in compliance with the License. You may obtain a copy of
   the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
   WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
   License for the specific language governing permissions and limitations under
   the License. *)

open Catala_utils
open Shared_ast
module I = Desugared.Ast
module O = Catala_types_t
module J = Catala_types_j
open Model

(* ==========================================================================
   COPIED FROM THE CATALA COMPILER. DO NOT EDIT HERE.

   Verbatim copy of [Desugared.From_surface.translate_literal]
   (compiler/desugared/from_surface.ml, Catala commit cf28da9f9), with the
   constants it takes from that module's top level inlined. The compiler does
   not export it, and the partial reader must turn surface literals into values
   without desugaring, which fails on a drifted test.

   Nothing checks that the two stay in sync. On every compiler upgrade, compare
   with the original; delete this copy once [From_surface] exports the function.
   ========================================================================== *)
let translate_literal l pos =
  let open Surface.Ast in
  let module Runtime = Catala_runtime in
  let int1 = Runtime.integer_of_int 1 in
  let intminus1 = Runtime.integer_of_int (-1) in
  let int100 = Runtime.integer_of_int 100 in
  let rat100 = Runtime.decimal_of_integer int100 in
  match l with
  | LNumber ((Int i, _), None) -> LInt (Runtime.integer_of_string i)
  | LNumber ((Int i, _), Some (Percent, _)) ->
    LRat
      Runtime.(
        Oper.o_div_rat_rat (Expr.pos_to_runtime pos) (decimal_of_string i)
          rat100)
  | LNumber ((Dec (i, f), _), None) ->
    LRat Runtime.(decimal_of_string (i ^ "." ^ f))
  | LNumber ((Dec (i, f), _), Some (Percent, _)) ->
    LRat
      Runtime.(
        Oper.o_div_rat_rat (Expr.pos_to_runtime pos)
          (decimal_of_string (i ^ "." ^ f))
          rat100)
  | LBool b -> LBool b
  | LMoneyAmount i ->
    LMoney
      Runtime.(
        money_of_cents_integer
          (Oper.o_mult_int_int
             (if i.money_amount_sign then int1 else intminus1)
             (Oper.o_add_int_int
                (Oper.o_mult_int_int
                   (integer_of_string i.money_amount_units)
                   int100)
                (integer_of_string i.money_amount_cents))))
  | LNumber ((Int i, _), Some (Year, _)) ->
    LDuration (Runtime.duration_of_numbers (int_of_string i) 0 0)
  | LNumber ((Int i, _), Some (Month, _)) ->
    LDuration (Runtime.duration_of_numbers 0 (int_of_string i) 0)
  | LNumber ((Int i, _), Some (Day, _)) ->
    LDuration (Runtime.duration_of_numbers 0 0 (int_of_string i))
  | LNumber ((Dec (_, _), _), Some ((Year | Month | Day), _)) ->
    Message.error ~pos
      "Impossible to specify decimal amounts of days, months or years."
  | LDate date ->
    if date.literal_date_month > 12 then
      Message.error ~pos
        "There is an error in this date: the month number is bigger than 12.";
    if date.literal_date_day > 31 then
      Message.error ~pos
        "There is an error in this date: the day number is bigger than 31.";
    LDate
      (try
         Runtime.date_of_numbers date.literal_date_year date.literal_date_month
           date.literal_date_day
       with Failure _ ->
         Message.error ~pos
           "There is an error in this date, it does not correspond to a \
            correct calendar day.")
(* ======================= END OF COPY FROM THE COMPILER ================== *)

(* The value attributes an ordinary read keeps ([get_value] sees them resolved;
   here they are still raw). The array editor tracks rows by them. *)
let surface_value_attrs (m : Pos.t) : O.attr_def list =
  List.filter_map
    (function
      | Shared_ast.Src ((p, _), Shared_ast.String (v, _), _) -> (
        match p with
        | ["testcase"; "uid"] -> Some (O.Uid v)
        | ["testcase"; "array_item_label"] -> Some (O.ArrayItemLabel v)
        | _ -> None)
      | _ -> None)
    (Pos.attrs m)

(* A bare constructor names no enum. Never a name; never printed as one. *)

let enum_name_of_path (p : Surface.Ast.path) =
  match p with
  | [] -> unknown_enum_name
  | p -> String.concat "." (List.map Mark.remove p)

(* Same kind of value, by name for records and enums: elements of one list
   describe one type, however few constructors or fields each literal wrote. *)
let rec same_shape (a : O.typ) (b : O.typ) =
  match a, b with
  | O.TUnset, _ | _, O.TUnset -> true
  | O.TEnum x, O.TEnum y -> x.O.enum_name = y.O.enum_name
  | O.TStruct x, O.TStruct y -> x.O.struct_name = y.O.struct_name
  | O.TArray x, O.TArray y | O.TOption x, O.TOption y -> same_shape x y
  | O.TTuple xs, O.TTuple ys ->
    List.length xs = List.length ys && List.for_all2 same_shape xs ys
  | _ -> a = b

let ( let*? ) = Result.bind

exception Err of string

let rec convert_literal (e : Surface.Ast.expression) :
      (O.typ * O.runtime_value, string) Result.t =
    try convert_literal_unguarded e
    with Message.CompilerError _ | Failure _ | Z.Overflow ->
      Error
        (Printf.sprintf "unreadable literal at %s"
           (Pos.to_string_short (Mark.get e)))
  and convert_literal_unguarded (e : Surface.Ast.expression) :
      (O.typ * O.runtime_value, string) Result.t =
    let open Surface.Ast in
    let ok ty raw =
      Ok (ty, O.{ value = raw; attrs = surface_value_attrs (Mark.get e) })
    in
    match Mark.remove e with
    | Literal l -> begin
      match translate_literal l Pos.void with
      | LBool b -> ok O.TBool (O.Bool b)
      | LInt z -> ok O.TInt (O.Integer (Z.to_int z))
      | LRat q -> ok O.TRat (O.Decimal (Q.to_float q))
      | LMoney m -> ok O.TMoney (O.Money (Z.to_int m))
      | LUnit -> assert false
      | LDate d ->
        let year, month, day = Dates_calc.date_to_ymd d in
        ok O.TDate (O.Date { year; month; day })
      | LDuration dur ->
        let years, months, days = Dates_calc.period_to_ymds dur in
        ok O.TDuration (O.Duration { years; months; days })
    end
    | EnumInject ((CBuiltin Absent, _), None) ->
      (* TOption, as in a signature, even though the value is carried as the
         Optional enum. A bare `Absent` has an unknown payload type. *)
      let edecl = mk_optional_enum_decl TUnit in
      ok (O.TOption O.TUnset) (O.Enum (edecl, (option_absent, None)))
    | EnumInject ((CBuiltin Present, _), Some sube) ->
      let*? subt, subv = convert_literal sube in
      let edecl = mk_optional_enum_decl subt in
      ok (O.TOption subt) (O.Enum (edecl, (option_present, Some subv)))
    (* `Mod.Enum.Ctor` carries the enum's full name, spelled as an ordinary read
       spells it. Bare, it names no enum. *)
    | EnumInject ((CConstr (p, (u, _)), _), None) ->
      let edecl =
        {
          O.enum_name = enum_name_of_path p;
          constructors = [u, None];
          ctor_attrs = [];
        }
      in
      ok (O.TEnum edecl) (O.Enum (edecl, (u, None)))
    | EnumInject ((CConstr (p, (u, _)), _), Some sube) ->
      let*? subt, subv = convert_literal sube in
      let edecl =
        {
          O.enum_name = enum_name_of_path p;
          constructors = [u, Some subt];
          ctor_attrs = [];
        }
      in
      ok (O.TEnum edecl) (O.Enum (edecl, (u, Some subv)))
    (* Element type unknowable from an empty list. *)
    | ArrayLit [] -> ok O.(TArray TUnset) O.(Array [||])
    | ArrayLit (_ :: _ as l) ->
      let*? ty, l =
        try
          let l =
            List.map
              (fun lit ->
                match convert_literal lit with
                | Error s -> raise (Err s)
                | Ok v -> v)
              l
          in
          let ty, _ = List.hd l in
          if not (List.for_all (fun (t, _) -> same_shape t ty) l) then
            raise (Err "a list mixing element types");
          Ok (ty, List.map snd l)
        with Err s -> Error s
      in
      ok O.(TArray ty) O.(Array (Array.of_list l))
    | StructLit (((path, (s_name, _)), _), fields) ->
      (* Qualified as the test wrote it, which is how an ordinary read names
         it. *)
      let s_name =
        match path with
        | [] -> s_name
        | p -> String.concat "." (List.map Mark.remove p) ^ "." ^ s_name
      in
      let*? fields =
        try
          Ok
            (List.map
               (fun ((n, _), lit) ->
                 match convert_literal lit with
                 | Error s -> raise (Err s)
                 | Ok (ty, v) -> n, ty, v)
               fields)
        with Err s -> Error s
      in
      let struct_decl =
        {
          O.struct_name = s_name;
          fields = List.map (fun (n, ty, _) -> n, ty) fields;
        }
      in
      ok (O.TStruct struct_decl)
        (O.Struct (struct_decl, List.map (fun (n, _, v) -> n, v) fields))
    | Builtin Impossible -> ok O.TUnset O.Unset
    | Tuple elems ->
      let*? parts =
        try
          Ok
            (List.map
               (fun elem ->
                 match convert_literal elem with
                 | Error s -> raise (Err s)
                 | Ok v -> v)
               elems)
        with Err s -> Error s
      in
      ok
        (O.TTuple (List.map fst parts))
        (O.Array (Array.of_list (List.map snd parts)))
    (* `1 year + 2 month`: how [write] spells a multi-unit duration. Still a
       literal. `+` on anything else is a computation, not a value. *)
    | Binop ((Add _, _), lhs, rhs) -> (
      let*? lt, lv = convert_literal lhs in
      let*? rt, rv = convert_literal rhs in
      match lt, lv.O.value, rt, rv.O.value with
      | O.TDuration, O.Duration a, O.TDuration, O.Duration b ->
        ok O.TDuration
          (O.Duration
             {
               years = a.O.years + b.O.years;
               months = a.O.months + b.O.months;
               days = a.O.days + b.O.days;
             })
      | _ -> Error "unsupported expression")
    | _ -> Error "unsupported expression"
