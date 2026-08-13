-- ==============================================================================
--  VCH-HaemLIS — Laboratory Information System (Haematology & Transfusion)
--  Vila Central Hospital, Port Vila — Laboratory Department, Ministry of Health
--  Schema version 1.0 | Target: PostgreSQL 13+
--
--  DESIGN NOTES
--  ------------
--  The schema is "complicated" where it must be (a fully coded test dictionary,
--  age/sex-banded reference intervals, delta checks, chain of custody, full
--  transfusion traceability, QC/EQA) and "simple" where the bench user touches
--  it: numeric results all land in ONE table (result), keyed by analyte code.
--  Adding a new test = one row in analyte + rows in reference_interval.
--  No schema migration is ever needed to widen the data set.
--
--  Narrative / inherently structured examinations (blood film, malaria, bone
--  marrow, transfusion) get their own typed tables because their fields are not
--  numeric observations and must be queryable for surveillance reporting.
--
--  SQLite port: drop the CREATE TYPE blocks and replace enum columns with
--  TEXT + CHECK(col IN (...)); replace TIMESTAMPTZ with TEXT (ISO-8601);
--  replace GENERATED ALWAYS AS IDENTITY with INTEGER PRIMARY KEY AUTOINCREMENT.
-- ==============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS haem;
SET search_path TO haem, public;

-- ==============================================================================
-- 0. CONTROLLED VOCABULARIES (enumerated types)
-- ==============================================================================

CREATE TYPE sex_at_birth      AS ENUM ('male','female','intersex','unknown');
CREATE TYPE priority_level    AS ENUM ('routine','urgent','stat','pre_op','ward_round');
CREATE TYPE request_status    AS ENUM ('draft','ordered','collected','received','in_progress',
                                       'partially_resulted','awaiting_validation','validated',
                                       'reported','amended','cancelled','rejected');
CREATE TYPE specimen_status   AS ENUM ('ordered','collected','in_transit','received','accepted',
                                       'rejected','aliquoted','stored','discarded');
CREATE TYPE result_status     AS ENUM ('pending','preliminary','entered','rerun','validated',
                                       'amended','cancelled','not_performed');
CREATE TYPE abnormal_flag     AS ENUM ('N','L','H','LL','HH','A','AA','R','<','>','I');  -- HL7 v2 table 0078 subset
CREATE TYPE result_datatype   AS ENUM ('numeric','text','coded','boolean','titre','ratio','image','structured');
CREATE TYPE plasmodium_sp     AS ENUM ('falciparum','vivax','malariae','ovale','knowlesi',
                                       'mixed','species_undetermined','none_seen');
CREATE TYPE abo_group         AS ENUM ('A','B','AB','O','indeterminate');
CREATE TYPE rhd_type          AS ENUM ('positive','negative','weak_D','variant','indeterminate');
CREATE TYPE component_type    AS ENUM ('whole_blood','packed_red_cells','fresh_frozen_plasma',
                                       'platelet_concentrate','cryoprecipitate','paediatric_rbc_aliquot');
CREATE TYPE unit_status       AS ENUM ('quarantine','available','reserved','crossmatched','issued',
                                       'transfused','returned','expired','discarded','recalled');
CREATE TYPE qc_level          AS ENUM ('low','normal','high','abnormal_low','abnormal_high');
CREATE TYPE notify_outcome    AS ENUM ('acknowledged','no_answer','left_message','escalated','failed');

-- ==============================================================================
-- 1. ORGANISATION, USERS, SECURITY, AUDIT
-- ==============================================================================

CREATE TABLE facility (
    facility_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    facility_code      TEXT NOT NULL UNIQUE,          -- 'VCH', 'NDH', 'LENAKEL', 'LOLOWAI', 'NORSUP', 'QAETVAES'
    facility_name      TEXT NOT NULL,
    facility_type      TEXT,                          -- national referral / provincial / health centre / dispensary
    province           TEXT,                          -- Shefa, Sanma, Tafea, Malampa, Penama, Torba
    island             TEXT,
    postal_address     TEXT,
    phone              TEXT,
    email              TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lab_section (
    section_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    facility_id        INT NOT NULL REFERENCES facility,
    section_code       TEXT NOT NULL,                 -- 'HAEM','COAG','BB','MALARIA','MORPH'
    section_name       TEXT NOT NULL,
    head_of_section    TEXT,
    operating_hours    TEXT,
    UNIQUE (facility_id, section_code)
);

CREATE TABLE staff_role (
    role_id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_code          TEXT NOT NULL UNIQUE,          -- PHLEB, TECH, SCIENTIST, SENIOR, PATHOLOGIST, ADMIN
    role_name          TEXT NOT NULL,
    can_register       BOOLEAN DEFAULT FALSE,
    can_collect        BOOLEAN DEFAULT FALSE,
    can_enter_result   BOOLEAN DEFAULT FALSE,
    can_validate       BOOLEAN DEFAULT FALSE,         -- release results to the ward
    can_amend          BOOLEAN DEFAULT FALSE,
    can_issue_blood    BOOLEAN DEFAULT FALSE,
    can_administer     BOOLEAN DEFAULT FALSE
);

CREATE TABLE lab_user (
    user_id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username           TEXT NOT NULL UNIQUE,
    full_name          TEXT NOT NULL,
    initials           TEXT NOT NULL,                 -- printed on the report
    registration_no    TEXT,                          -- professional registration
    email              TEXT,
    phone              TEXT,
    password_hash      TEXT NOT NULL,
    section_id         INT REFERENCES lab_section,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at      TIMESTAMPTZ,
    failed_logins      INT DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_role (
    user_id            INT NOT NULL REFERENCES lab_user,
    role_id            INT NOT NULL REFERENCES staff_role,
    granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by         INT REFERENCES lab_user,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE competency_record (         -- ISO 15189 clause 6.2: who may do what
    competency_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            INT NOT NULL REFERENCES lab_user,
    procedure_name     TEXT NOT NULL,                 -- 'Manual differential', 'Malaria microscopy'
    assessed_on        DATE NOT NULL,
    assessed_by        INT REFERENCES lab_user,
    outcome            TEXT NOT NULL,                 -- competent / needs_supervision / not_competent
    valid_until        DATE,
    evidence_ref       TEXT
);

CREATE TABLE audit_log (                 -- append-only; never UPDATE or DELETE
    audit_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id            INT REFERENCES lab_user,
    workstation        TEXT,
    action             TEXT NOT NULL,                 -- INSERT/UPDATE/DELETE/LOGIN/PRINT/RELEASE/OVERRIDE
    table_name         TEXT NOT NULL,
    record_pk          TEXT NOT NULL,
    field_name         TEXT,
    old_value          TEXT,
    new_value          TEXT,
    reason             TEXT
);

-- ==============================================================================
-- 2. MASTER DATA — WHERE THE PATIENT AND THE REQUEST COME FROM
-- ==============================================================================

CREATE TABLE ward_location (
    location_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    facility_id        INT NOT NULL REFERENCES facility,
    location_code      TEXT NOT NULL,                 -- MED, SURG, PAED, MAT, ED, ICU, OPD, TB, ANC, THEATRE
    location_name      TEXT NOT NULL,
    phone_extension    TEXT,
    is_inpatient       BOOLEAN DEFAULT TRUE,
    UNIQUE (facility_id, location_code)
);

CREATE TABLE clinician (
    clinician_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clinician_code     TEXT UNIQUE,
    full_name          TEXT NOT NULL,
    designation        TEXT,                          -- MO, Registrar, Consultant, Nurse Practitioner, Midwife
    speciality         TEXT,
    default_location   INT REFERENCES ward_location,
    contact_phone      TEXT,
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE specimen_type (
    specimen_type_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code               TEXT NOT NULL UNIQUE,          -- WB-EDTA, WB-CIT, WB-HEP, BM-ASP, BM-TRE, CSF, PLEURAL...
    name               TEXT NOT NULL,
    anticoagulant      TEXT,                          -- K2EDTA / K3EDTA / 3.2% sodium citrate / lithium heparin / none
    tube_colour        TEXT,                          -- lavender, light blue, green, plain
    default_volume_ml  NUMERIC(5,2),
    min_volume_ml      NUMERIC(5,2),
    fill_tolerance_pct NUMERIC(4,1),                  -- citrate must be 90-110% filled
    stability_hours    NUMERIC(6,2),                  -- max time from collection to analysis
    storage_temp       TEXT,                          -- 'ambient 18-25C', '2-8C', '-20C'
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE rejection_reason (
    reason_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reason_code        TEXT NOT NULL UNIQUE,          -- CLOT, HAEM, QNS, UNLAB, MISLAB, WRONGTUBE, LEAK, OLD, DILUTE
    reason_text        TEXT NOT NULL,
    is_recollect       BOOLEAN DEFAULT TRUE,
    counts_as_incident BOOLEAN DEFAULT TRUE
);

-- ==============================================================================
-- 3. TEST DICTIONARY — the extensible spine of the system
-- ==============================================================================

CREATE TABLE analyte (
    analyte_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analyte_code       TEXT NOT NULL UNIQUE,          -- 'HGB','WBC','NEUT_ABS','INR','MAL_DENS'
    analyte_name       TEXT NOT NULL,                 -- printed name
    short_name         TEXT,                          -- bench/worksheet name
    loinc_code         TEXT,                          -- e.g. 718-7 Hemoglobin [Mass/volume] in Blood
    snomed_code        TEXT,
    section_code       TEXT NOT NULL,                 -- HAEM / COAG / BB / MALARIA / MORPH
    datatype           result_datatype NOT NULL DEFAULT 'numeric',
    unit               TEXT,                          -- g/L, x10^9/L, fL, pg, %, s, mm/h
    decimal_places     SMALLINT DEFAULT 1,
    is_calculated      BOOLEAN DEFAULT FALSE,
    calculation_expr   TEXT,                          -- e.g. 'HGB/RBC*10' for MCH
    is_reportable      BOOLEAN DEFAULT TRUE,          -- FALSE = research/flag-only parameter
    reportable_low     NUMERIC(14,4),                 -- analytical measuring range
    reportable_high    NUMERIC(14,4),
    absurd_low         NUMERIC(14,4),                 -- incompatible with life -> block entry
    absurd_high        NUMERIC(14,4),
    coded_set_code     TEXT,                          -- FK-by-code to coded_value.set_code when datatype='coded'
    display_order      INT DEFAULT 999,
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE coded_value (               -- pick-lists: morphology grades, film comments, species...
    coded_value_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    set_code           TEXT NOT NULL,                 -- 'GRADE_0_4','RBC_MORPH','WBC_MORPH','PLT_MORPH','POS_NEG'
    value_code         TEXT NOT NULL,
    display_text       TEXT NOT NULL,
    numeric_rank       NUMERIC(6,2),                  -- lets '3+' be sorted/trended
    display_order      INT DEFAULT 999,
    is_abnormal        BOOLEAN DEFAULT FALSE,
    UNIQUE (set_code, value_code)
);

CREATE TABLE test_panel (                -- what the clinician actually orders
    panel_id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    panel_code         TEXT NOT NULL UNIQUE,          -- 'FBC','FBC_FILM','MPS','COAG','GXM','RETIC','ESR','BMA'
    panel_name         TEXT NOT NULL,
    section_code       TEXT NOT NULL,
    specimen_type_id   INT REFERENCES specimen_type,
    default_priority   priority_level DEFAULT 'routine',
    tat_routine_mins   INT,                           -- turnaround target, used by the dashboard
    tat_urgent_mins    INT,
    price_vuv          NUMERIC(10,2),                 -- cost recovery in vatu, nullable for public patients
    requires_clin_info BOOLEAN DEFAULT FALSE,
    patient_prep_note  TEXT,                          -- e.g. 'night blood 22:00-02:00 for microfilariae'
    is_orderable       BOOLEAN DEFAULT TRUE,
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE panel_analyte (
    panel_id           INT NOT NULL REFERENCES test_panel,
    analyte_id         INT NOT NULL REFERENCES analyte,
    display_order      INT DEFAULT 999,
    is_mandatory       BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (panel_id, analyte_id)
);

CREATE TABLE reflex_rule (               -- automatic add-on testing
    reflex_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trigger_analyte    INT NOT NULL REFERENCES analyte,
    operator           TEXT NOT NULL,                 -- '<','>','between','flag_present'
    threshold_low      NUMERIC(14,4),
    threshold_high     NUMERIC(14,4),
    add_panel_id       INT NOT NULL REFERENCES test_panel,
    rule_note          TEXT,                          -- 'PLT <100 -> blood film + malaria screen'
    is_active          BOOLEAN DEFAULT TRUE
);

-- ==============================================================================
-- 4. INTERPRETATION RULES — reference intervals, criticals, deltas, autoverify
-- ==============================================================================

CREATE TABLE reference_interval (
    ri_id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analyte_id         INT NOT NULL REFERENCES analyte,
    sex                sex_at_birth,                  -- NULL = applies to all
    age_low_days       INT NOT NULL DEFAULT 0,
    age_high_days      INT NOT NULL DEFAULT 43800,    -- ~120 years
    population         TEXT,                          -- 'general','pregnant_t1','pregnant_t2','pregnant_t3','altitude'
    specimen_type_id   INT REFERENCES specimen_type,
    lower_limit        NUMERIC(14,4),
    upper_limit        NUMERIC(14,4),
    text_interval      TEXT,                          -- e.g. 'Not detected' for qualitative analytes
    source_reference   TEXT,                          -- where the interval came from
    verified_on        DATE,                          -- ISO 15189 requires periodic local review
    verified_by        INT REFERENCES lab_user,
    effective_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to       DATE
);

CREATE TABLE critical_limit (
    critical_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analyte_id         INT NOT NULL REFERENCES analyte,
    sex                sex_at_birth,
    age_low_days       INT NOT NULL DEFAULT 0,
    age_high_days      INT NOT NULL DEFAULT 43800,
    critical_low       NUMERIC(14,4),
    critical_high      NUMERIC(14,4),
    is_first_only      BOOLEAN DEFAULT FALSE,         -- notify only on first occurrence in an admission
    notify_within_mins INT DEFAULT 30,
    action_note        TEXT
);

CREATE TABLE delta_check_rule (
    delta_id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analyte_id         INT NOT NULL REFERENCES analyte,
    lookback_hours     INT NOT NULL DEFAULT 168,
    abs_change_limit   NUMERIC(14,4),
    pct_change_limit   NUMERIC(6,2),
    action             TEXT NOT NULL DEFAULT 'hold_for_review'  -- hold_for_review / comment_only / repeat_sample
);

CREATE TABLE autoverify_rule (           -- results that may be released without human review
    autoverify_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    panel_id           INT NOT NULL REFERENCES test_panel,
    condition_expr     TEXT NOT NULL,                 -- 'all_within_ri AND no_instrument_flag AND no_delta'
    max_priority       priority_level DEFAULT 'routine',
    exclude_first_ever BOOLEAN DEFAULT TRUE,
    is_active          BOOLEAN DEFAULT FALSE
);

CREATE TABLE comment_library (           -- canned interpretive comments, keeps reports consistent
    comment_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comment_code       TEXT NOT NULL UNIQUE,
    section_code       TEXT,
    comment_text       TEXT NOT NULL,
    auto_trigger_expr  TEXT,                          -- optional rule that suggests the comment
    requires_signoff   BOOLEAN DEFAULT FALSE
);

-- ==============================================================================
-- 5. PATIENT
-- ==============================================================================

CREATE TABLE patient (
    patient_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_number    TEXT NOT NULL UNIQUE,          -- VCH unit record number
    national_health_id TEXT,
    family_name        TEXT NOT NULL,
    given_names        TEXT NOT NULL,
    other_names        TEXT,
    preferred_name     TEXT,
    sex                sex_at_birth NOT NULL DEFAULT 'unknown',
    date_of_birth      DATE,
    dob_estimated      BOOLEAN DEFAULT FALSE,         -- common where birth is unregistered
    age_years_at_reg   INT,                           -- fallback when DOB unknown
    village            TEXT,
    island             TEXT,                          -- drives malaria/geographic risk comments
    province           TEXT,
    area_council       TEXT,
    contact_phone      TEXT,
    next_of_kin_name   TEXT,
    next_of_kin_phone  TEXT,
    language           TEXT DEFAULT 'Bislama',        -- Bislama / English / French / vernacular
    nationality        TEXT DEFAULT 'Ni-Vanuatu',
    is_deceased        BOOLEAN DEFAULT FALSE,
    date_of_death      DATE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         INT REFERENCES lab_user,
    merged_into        BIGINT REFERENCES patient,     -- duplicate resolution without data loss
    CHECK (date_of_birth IS NOT NULL OR age_years_at_reg IS NOT NULL)
);

CREATE TABLE patient_identifier (        -- passport, MCH book, TB register, ART number, donor number
    identifier_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    id_type            TEXT NOT NULL,
    id_value           TEXT NOT NULL,
    issuing_authority  TEXT,
    UNIQUE (id_type, id_value)
);

CREATE TABLE patient_flag (              -- sticky clinical facts the bench must see every time
    flag_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    flag_code          TEXT NOT NULL,                 -- G6PD_DEF, ALPHA_THAL, RBC_ANTIBODY, ON_WARFARIN,
                                                      -- SPLENECTOMY, CHEMO, HIV, PREGNANT, SICKLE_TRAIT
    flag_detail        TEXT,
    severity           TEXT,                          -- info / warning / critical
    raised_on          DATE NOT NULL DEFAULT CURRENT_DATE,
    raised_by          INT REFERENCES lab_user,
    expires_on         DATE,
    is_active          BOOLEAN DEFAULT TRUE
);

-- ==============================================================================
-- 6. REQUEST, SPECIMEN, CHAIN OF CUSTODY
-- ==============================================================================

CREATE TABLE lab_request (
    request_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    accession_no       TEXT NOT NULL UNIQUE,          -- H26-000123  (section-year-sequence)
    patient_id         BIGINT NOT NULL REFERENCES patient,
    facility_id        INT NOT NULL REFERENCES facility,
    location_id        INT REFERENCES ward_location,
    clinician_id       INT REFERENCES clinician,
    priority           priority_level NOT NULL DEFAULT 'routine',
    status             request_status NOT NULL DEFAULT 'ordered',
    requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    required_by        TIMESTAMPTZ,
    clinical_details   TEXT,                          -- free text from the request form
    provisional_dx     TEXT,
    icd10_code         TEXT,
    current_medication TEXT,                          -- warfarin, heparin, chemo, antimalarials, iron
    is_pregnant        BOOLEAN,
    gestation_weeks    NUMERIC(4,1),
    is_fasting         BOOLEAN,
    transfused_last_72h BOOLEAN,
    is_outpatient      BOOLEAN DEFAULT FALSE,
    referred_from      INT REFERENCES facility,       -- outer-island referral
    billing_category   TEXT,                          -- public / private / insurance / staff / research
    created_by         INT REFERENCES lab_user,
    cancelled_reason   TEXT
);

CREATE TABLE request_panel (
    request_panel_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id         BIGINT NOT NULL REFERENCES lab_request,
    panel_id           INT NOT NULL REFERENCES test_panel,
    status             request_status NOT NULL DEFAULT 'ordered',
    added_by_reflex    INT REFERENCES reflex_rule,
    added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (request_id, panel_id)
);

CREATE TABLE specimen (
    specimen_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_barcode   TEXT NOT NULL UNIQUE,
    request_id         BIGINT NOT NULL REFERENCES lab_request,
    specimen_type_id   INT NOT NULL REFERENCES specimen_type,
    status             specimen_status NOT NULL DEFAULT 'ordered',
    collected_at       TIMESTAMPTZ,
    collected_by       INT REFERENCES lab_user,
    collector_name_ext TEXT,                          -- when collected on the ward by nursing staff
    collection_site    TEXT,                          -- antecubital fossa / heel prick / finger prick / CVC
    collection_method  TEXT,                          -- venepuncture / capillary / line draw
    difficulty_note    TEXT,                          -- 'difficult draw', 'crying infant' — explains haemolysis
    volume_ml          NUMERIC(5,2),
    received_at        TIMESTAMPTZ,
    received_by        INT REFERENCES lab_user,
    condition_on_receipt TEXT,                        -- satisfactory / haemolysed / clotted / underfilled / warm
    haemolysis_index   SMALLINT,                      -- 0-4
    lipaemia_index     SMALLINT,
    icterus_index      SMALLINT,
    is_rejected        BOOLEAN DEFAULT FALSE,
    rejection_reason_id INT REFERENCES rejection_reason,
    rejection_note     TEXT,
    storage_location   TEXT,                          -- rack/box/position for retrieval
    discard_due        DATE,
    discarded_at       TIMESTAMPTZ
);

CREATE TABLE specimen_event (            -- append-only chain of custody
    event_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen,
    event_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type         TEXT NOT NULL,                 -- COLLECTED, DISPATCHED, RECEIVED, ALIQUOTED, LOADED,
                                                      -- RERUN, FILM_MADE, STORED, RETRIEVED, DISCARDED
    user_id            INT REFERENCES lab_user,
    from_location      TEXT,
    to_location        TEXT,
    temperature_c      NUMERIC(4,1),
    note               TEXT
);

-- ==============================================================================
-- 7. RESULTS
-- ==============================================================================

CREATE TABLE instrument (
    instrument_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_code    TEXT NOT NULL UNIQUE,          -- 'XN550-1','SYSMEX-CA','MICROSCOPE-3'
    manufacturer       TEXT,
    model              TEXT,                          -- Sysmex XN-550, XS-500i, CA-104, Mindray BC-5150
    serial_no          TEXT,
    section_id         INT REFERENCES lab_section,
    software_version   TEXT,
    installed_on       DATE,
    service_contact    TEXT,
    last_service_on    DATE,
    next_service_due   DATE,
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE analytical_run (
    run_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_id      INT REFERENCES instrument,
    run_started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    operator_id        INT REFERENCES lab_user,
    qc_status          TEXT,                          -- pass / warning / fail / not_run
    reagent_lot        TEXT,
    ambient_temp_c     NUMERIC(4,1),
    note               TEXT
);

-- The single wide-open results table. Every numeric, coded, or text observation
-- for every haematology test lands here. This is what makes the data set
-- effectively unbounded without touching the schema.
CREATE TABLE result (
    result_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen,
    request_id         BIGINT NOT NULL REFERENCES lab_request,
    analyte_id         INT NOT NULL REFERENCES analyte,
    run_id             BIGINT REFERENCES analytical_run,
    value_numeric      NUMERIC(14,4),
    value_text         TEXT,
    value_code         TEXT,                          -- -> coded_value.value_code
    value_boolean      BOOLEAN,
    operator_prefix    TEXT,                          -- '<' or '>' for off-scale results
    unit               TEXT,                          -- copied at time of result (units can change over years)
    ri_low             NUMERIC(14,4),                 -- snapshot of the interval applied
    ri_high            NUMERIC(14,4),
    ri_text            TEXT,
    abnormal_flag      abnormal_flag DEFAULT 'N',
    instrument_flags   TEXT,                          -- raw analyser flags: 'Blasts?','PLT Clumps?','NRBC'
    is_critical        BOOLEAN DEFAULT FALSE,
    delta_flag         BOOLEAN DEFAULT FALSE,
    delta_previous     NUMERIC(14,4),
    delta_pct          NUMERIC(8,2),
    status             result_status NOT NULL DEFAULT 'pending',
    method             TEXT,                          -- 'impedance','SLS-haemoglobin','manual chamber','Westergren'
    dilution_factor    NUMERIC(8,3) DEFAULT 1,
    repeat_count       SMALLINT DEFAULT 0,
    entered_at         TIMESTAMPTZ,
    entered_by         INT REFERENCES lab_user,
    validated_at       TIMESTAMPTZ,
    validated_by       INT REFERENCES lab_user,
    result_comment     TEXT,
    UNIQUE (specimen_id, analyte_id, repeat_count)
);

CREATE TABLE result_amendment (          -- every correction is kept; reports must show they were amended
    amendment_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    result_id          BIGINT NOT NULL REFERENCES result,
    amended_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    amended_by         INT NOT NULL REFERENCES lab_user,
    old_value          TEXT,
    new_value          TEXT,
    reason             TEXT NOT NULL,
    clinician_informed BOOLEAN DEFAULT FALSE,
    informed_at        TIMESTAMPTZ
);

-- --- Manual differential: stored cell-by-cell so the count can be audited -----
CREATE TABLE manual_differential (
    diff_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    cells_counted      SMALLINT NOT NULL DEFAULT 100,
    counted_by         INT REFERENCES lab_user,
    counted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    second_reader      INT REFERENCES lab_user,       -- double-reading for abnormal films
    stain              TEXT DEFAULT 'Giemsa',         -- Giemsa / Wright / May-Grunwald-Giemsa / Field
    -- percentages
    neutrophil_pct     NUMERIC(5,1), band_pct          NUMERIC(5,1),
    lymphocyte_pct     NUMERIC(5,1), atyp_lymph_pct    NUMERIC(5,1),
    monocyte_pct       NUMERIC(5,1), eosinophil_pct    NUMERIC(5,1),
    basophil_pct       NUMERIC(5,1), metamyelocyte_pct NUMERIC(5,1),
    myelocyte_pct      NUMERIC(5,1), promyelocyte_pct  NUMERIC(5,1),
    blast_pct          NUMERIC(5,1), plasma_cell_pct   NUMERIC(5,1),
    prolymphocyte_pct  NUMERIC(5,1), other_pct         NUMERIC(5,1),
    other_description  TEXT,
    nrbc_per_100_wbc   NUMERIC(6,1),                  -- triggers WBC correction
    wbc_corrected      NUMERIC(8,2),
    smudge_cells_note  TEXT
);

-- --- Blood film morphology report -------------------------------------------
CREATE TABLE blood_film (
    film_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    examined_by        INT REFERENCES lab_user,
    examined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    film_quality       TEXT,                          -- good / acceptable / poor - recollect
    -- red cells (graded 0 / 1+ / 2+ / 3+ against coded_value set RBC_GRADE)
    rbc_size           TEXT,                          -- normocytic / microcytic / macrocytic / dimorphic
    rbc_chromia        TEXT,                          -- normochromic / hypochromic
    anisocytosis       TEXT, poikilocytosis  TEXT,
    target_cells       TEXT, ovalocytes      TEXT,    -- SE Asian ovalocytosis is prevalent in Melanesia
    elliptocytes       TEXT, spherocytes     TEXT,
    schistocytes       TEXT, sickle_cells    TEXT,
    tear_drop_cells    TEXT, acanthocytes    TEXT,
    echinocytes        TEXT, stomatocytes    TEXT,
    basophilic_stipple TEXT, howell_jolly    TEXT,
    pappenheimer       TEXT, rouleaux        TEXT,
    agglutination      TEXT, polychromasia   TEXT,
    nrbc_present       BOOLEAN,
    -- white cells
    wbc_estimate       TEXT,                          -- adequate / decreased / increased
    left_shift         BOOLEAN, toxic_granulation BOOLEAN,
    dohle_bodies       BOOLEAN, vacuolation      BOOLEAN,
    hypersegmentation  BOOLEAN, pelger_huet      BOOLEAN,
    atypical_lymphs    BOOLEAN, blasts_seen      BOOLEAN,
    auer_rods          BOOLEAN, hairy_cells      BOOLEAN,
    -- platelets
    plt_estimate       TEXT,                          -- adequate / decreased / increased
    giant_platelets    BOOLEAN, platelet_clumps  BOOLEAN,
    grey_platelets     BOOLEAN,
    -- parasites / inclusions seen on film
    malaria_seen       BOOLEAN, microfilaria_seen BOOLEAN,
    other_parasite     TEXT,                          -- trypanosomes, babesia, borrelia
    film_conclusion    TEXT NOT NULL,                 -- the narrative the clinician reads
    suggested_action   TEXT,                          -- 'iron studies', 'refer haematology', 'repeat in 2/52'
    reviewed_by        INT REFERENCES lab_user,       -- senior scientist / pathologist sign-off
    reviewed_at        TIMESTAMPTZ
);

-- --- Malaria (the highest-volume urgent haematology test in Vanuatu) ---------
CREATE TABLE malaria_examination (
    malaria_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    examined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    examined_by        INT REFERENCES lab_user,
    method             TEXT NOT NULL DEFAULT 'thick_and_thin_giemsa',  -- + 'RDT','both'
    rdt_brand          TEXT,
    rdt_pf_line        TEXT,                          -- positive / negative / invalid
    rdt_pan_line       TEXT,
    thick_film_result  TEXT,                          -- positive / negative / not_done
    thin_film_result   TEXT,
    species            plasmodium_sp NOT NULL DEFAULT 'none_seen',
    second_species     plasmodium_sp,
    asexual_seen       BOOLEAN DEFAULT FALSE,
    ring_forms         BOOLEAN, trophozoites BOOLEAN,
    schizonts          BOOLEAN, gametocytes  BOOLEAN,
    parasites_counted  INT,                           -- WHO method: count against 200 (or 500) WBC
    wbc_counted        INT,
    wbc_used_for_calc  NUMERIC(8,2),                  -- patient WBC if available, else assumed 8.0 x10^9/L
    parasite_density   NUMERIC(12,2),                 -- parasites per microlitre
    parasitaemia_pct   NUMERIC(6,3),                  -- % parasitised RBC (thin film, >=1000 RBC)
    gametocyte_density NUMERIC(12,2),
    fields_examined    INT,                           -- 100 fields before declaring negative
    hyperparasitaemia  BOOLEAN,                       -- >= 4% or >= 200 000/uL -> critical
    pigment_in_wbc     BOOLEAN,                       -- malarial pigment: severity marker
    slide_retained     BOOLEAN DEFAULT TRUE,
    slide_archive_ref  TEXT,                          -- for the national malaria programme cross-check
    cross_checked_by   INT REFERENCES lab_user,
    cross_check_result TEXT,
    notified_program   BOOLEAN DEFAULT FALSE,         -- notifiable disease reporting
    notified_at        TIMESTAMPTZ
);

-- --- Special haematology ----------------------------------------------------
CREATE TABLE haemoglobinopathy_screen (
    screen_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    sickling_test      TEXT,                          -- positive / negative / not_done
    solubility_test    TEXT,
    hb_electrophoresis TEXT,                          -- pattern: AA / AS / SS / AC / AE / A2 raised
    hba_pct            NUMERIC(5,2), hba2_pct NUMERIC(5,2), hbf_pct NUMERIC(5,2),
    hbs_pct            NUMERIC(5,2), hbe_pct  NUMERIC(5,2), other_band TEXT,
    g6pd_method        TEXT,                          -- fluorescent spot / quantitative / RDT
    g6pd_result        TEXT,                          -- normal / partial / deficient
    g6pd_activity      NUMERIC(6,2),                  -- U/g Hb
    heinz_bodies       TEXT,
    osmotic_fragility  TEXT,
    interpretation     TEXT,
    performed_by       INT REFERENCES lab_user,
    performed_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE body_fluid_count (
    fluid_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    fluid_type         TEXT NOT NULL,                 -- CSF / pleural / peritoneal / synovial / pericardial
    appearance         TEXT,                          -- clear / turbid / xanthochromic / bloodstained
    total_nucleated    NUMERIC(10,2),                 -- x10^6/L
    wbc_count          NUMERIC(10,2),
    rbc_count          NUMERIC(12,2),
    polymorph_pct      NUMERIC(5,1),
    mononuclear_pct    NUMERIC(5,1),
    eosinophil_pct     NUMERIC(5,1),
    malignant_cells    TEXT,
    crystals           TEXT,                          -- urate / pyrophosphate / none seen
    chamber_used       TEXT DEFAULT 'Fuchs-Rosenthal',
    dilution           TEXT,
    performed_by       INT REFERENCES lab_user,
    performed_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bone_marrow_report (
    marrow_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen UNIQUE,
    aspirate_site      TEXT,                          -- posterior iliac crest / sternum / tibia (infants)
    trephine_taken     BOOLEAN DEFAULT FALSE,
    indication         TEXT,
    cellularity        TEXT,                          -- hypocellular / normocellular / hypercellular
    me_ratio           NUMERIC(6,2),
    erythropoiesis     TEXT, granulopoiesis TEXT, megakaryopoiesis TEXT,
    blast_pct          NUMERIC(5,1),
    iron_stores        TEXT,                          -- absent / reduced / adequate / increased
    ring_sideroblasts  TEXT,
    parasites_seen     TEXT,                          -- leishmania, malaria pigment, mycobacteria
    special_stains     TEXT,                          -- Perls, PAS, Sudan Black
    conclusion         TEXT,
    reported_by        INT REFERENCES lab_user,
    referred_out_to    TEXT,                          -- overseas referral for flow/cytogenetics
    reported_at        TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 8. TRANSFUSION SERVICE — full vein-to-vein traceability
-- ==============================================================================

CREATE TABLE blood_group_record (
    group_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    specimen_id        BIGINT REFERENCES specimen,
    abo                abo_group NOT NULL,
    rhd                rhd_type NOT NULL,
    -- forward (cell) grouping reactions, graded 0-4
    anti_a             TEXT, anti_b  TEXT, anti_ab TEXT, anti_d1 TEXT, anti_d2 TEXT,
    -- reverse (serum) grouping
    a1_cells           TEXT, b_cells TEXT, o_cells TEXT,
    dat_result         TEXT,                          -- direct antiglobulin test
    extended_phenotype TEXT,                          -- C c E e K k Fya Fyb Jka Jkb M N S s
    is_confirmatory    BOOLEAN DEFAULT FALSE,         -- second independent sample rule
    method             TEXT DEFAULT 'tube',           -- tube / column agglutination / slide
    performed_by       INT REFERENCES lab_user,
    checked_by         INT REFERENCES lab_user,       -- two-person check for grouping
    performed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    discrepancy_note   TEXT
);

CREATE TABLE antibody_screen (
    screen_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    specimen_id        BIGINT NOT NULL REFERENCES specimen,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    method             TEXT,                          -- IAT tube / column agglutination / enzyme
    cell_i             TEXT, cell_ii TEXT, cell_iii TEXT,
    autocontrol        TEXT,
    screen_result      TEXT NOT NULL,                 -- negative / positive
    antibodies_found   TEXT,                          -- 'anti-D, anti-C'
    clinically_signif  BOOLEAN,
    valid_until        TIMESTAMPTZ,                   -- 72 h if transfused/pregnant in last 3 months
    performed_by       INT REFERENCES lab_user,
    performed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blood_donor (
    donor_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donor_number       TEXT NOT NULL UNIQUE,
    patient_id         BIGINT REFERENCES patient,     -- linked if the donor is also a patient
    family_name        TEXT NOT NULL,
    given_names        TEXT NOT NULL,
    sex                sex_at_birth,
    date_of_birth      DATE,
    abo                abo_group,
    rhd                rhd_type,
    donor_type         TEXT,                          -- voluntary / family_replacement / directed / autologous
    contact_phone      TEXT,
    village            TEXT,
    island             TEXT,
    first_donation     DATE,
    last_donation      DATE,
    total_donations    INT DEFAULT 0,
    is_deferred        BOOLEAN DEFAULT FALSE,
    deferral_reason    TEXT,
    deferral_until     DATE,
    is_active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE donation (
    donation_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_number    TEXT NOT NULL UNIQUE,
    donor_id           BIGINT NOT NULL REFERENCES blood_donor,
    donated_at         TIMESTAMPTZ NOT NULL,
    collection_site    TEXT,                          -- VCH blood bank / mobile drive / outer island
    haemoglobin_screen NUMERIC(5,1),                  -- pre-donation Hb g/L
    weight_kg          NUMERIC(5,1),
    bp_systolic        INT, bp_diastolic INT, pulse INT, temperature_c NUMERIC(4,1),
    volume_collected_ml INT,
    bag_lot_number     TEXT,
    adverse_event      TEXT,                          -- vasovagal / haematoma / none
    -- transfusion-transmissible infection screening (release gate)
    hiv_result         TEXT, hbsag_result TEXT, hcv_result TEXT,
    syphilis_result    TEXT, malaria_screen TEXT,
    tti_completed_at   TIMESTAMPTZ,
    tti_performed_by   INT REFERENCES lab_user,
    is_released        BOOLEAN DEFAULT FALSE,
    released_by        INT REFERENCES lab_user,
    discard_reason     TEXT
);

CREATE TABLE blood_unit (
    unit_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_number        TEXT NOT NULL UNIQUE,          -- ISBT 128 donation identification number
    donation_id        BIGINT REFERENCES donation,
    component          component_type NOT NULL,
    abo                abo_group NOT NULL,
    rhd                rhd_type NOT NULL,
    volume_ml          INT,
    prepared_at        TIMESTAMPTZ,
    expiry_at          TIMESTAMPTZ NOT NULL,
    status             unit_status NOT NULL DEFAULT 'quarantine',
    storage_fridge     TEXT,                          -- fridge/freezer/agitator identifier
    shelf_position     TEXT,
    is_irradiated      BOOLEAN DEFAULT FALSE,
    is_leucodepleted   BOOLEAN DEFAULT FALSE,
    reserved_for       BIGINT REFERENCES patient,
    reserved_until     TIMESTAMPTZ,
    imported_from      TEXT,                          -- units flown in from an overseas supplier
    visual_check_ok    BOOLEAN,
    discard_reason     TEXT
);

CREATE TABLE crossmatch (
    crossmatch_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id         BIGINT NOT NULL REFERENCES lab_request,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    unit_id            BIGINT NOT NULL REFERENCES blood_unit,
    specimen_id        BIGINT NOT NULL REFERENCES specimen,
    method             TEXT NOT NULL,                 -- immediate_spin / IAT / electronic
    immediate_spin     TEXT, thirty_seven_c TEXT, iat_phase TEXT,
    compatible         BOOLEAN NOT NULL,
    incompatibility_note TEXT,
    performed_by       INT REFERENCES lab_user,
    checked_by         INT REFERENCES lab_user,
    performed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until        TIMESTAMPTZ,
    UNIQUE (patient_id, unit_id, specimen_id)
);

CREATE TABLE unit_issue (
    issue_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id            BIGINT NOT NULL REFERENCES blood_unit,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    crossmatch_id      BIGINT REFERENCES crossmatch,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_by          INT NOT NULL REFERENCES lab_user,
    collected_by_name  TEXT NOT NULL,                 -- ward staff who took the unit
    destination        INT REFERENCES ward_location,
    is_emergency       BOOLEAN DEFAULT FALSE,         -- uncrossmatched group O issue
    emergency_auth_by  TEXT,
    returned_at        TIMESTAMPTZ,
    return_condition   TEXT,                          -- fit_for_reissue / discard (out of temp range >30 min)
    fate               TEXT                           -- transfused / returned / wasted
);

CREATE TABLE transfusion_episode (
    episode_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id            BIGINT NOT NULL REFERENCES blood_unit,
    patient_id         BIGINT NOT NULL REFERENCES patient,
    issue_id           BIGINT REFERENCES unit_issue,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    administered_by    TEXT,
    checked_by         TEXT,
    indication         TEXT,
    pre_hb             NUMERIC(5,1), post_hb NUMERIC(5,1),
    pre_plt            NUMERIC(8,2), post_plt NUMERIC(8,2),
    volume_given_ml    INT,
    reaction_occurred  BOOLEAN DEFAULT FALSE
);

CREATE TABLE transfusion_reaction (
    reaction_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id         BIGINT NOT NULL REFERENCES transfusion_episode,
    reported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    onset_minutes      INT,
    reaction_type      TEXT,                          -- FNHTR / allergic / anaphylactic / acute_haemolytic /
                                                      -- delayed_haemolytic / TACO / TRALI / septic / hypotensive
    severity           TEXT,                          -- mild / moderate / severe / life_threatening
    signs_symptoms     TEXT,
    temp_pre           NUMERIC(4,1), temp_post NUMERIC(4,1),
    bp_pre             TEXT, bp_post TEXT,
    unit_returned      BOOLEAN,
    repeat_group_check TEXT,
    dat_post           TEXT,
    haemolysis_evidence TEXT,
    culture_result     TEXT,
    investigation_conclusion TEXT,
    imputability       TEXT,                          -- definite / probable / possible / unlikely / excluded
    reported_to_committee BOOLEAN DEFAULT FALSE,
    investigated_by    INT REFERENCES lab_user
);

CREATE TABLE fridge_temperature_log (
    temp_log_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_code     TEXT NOT NULL,
    recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    temperature_c      NUMERIC(5,2) NOT NULL,
    within_range       BOOLEAN,
    recorded_by        INT REFERENCES lab_user,
    action_taken       TEXT
);

-- ==============================================================================
-- 9. QUALITY — internal QC, external quality assessment, reagents, maintenance
-- ==============================================================================

CREATE TABLE control_material (
    control_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    control_name       TEXT NOT NULL,                 -- 'XN CHECK L1'
    manufacturer       TEXT,
    lot_number         TEXT NOT NULL,
    level              qc_level NOT NULL,
    instrument_id      INT REFERENCES instrument,
    received_on        DATE,
    opened_on          DATE,
    expiry_date        DATE NOT NULL,
    is_active          BOOLEAN DEFAULT TRUE,
    UNIQUE (control_name, lot_number)
);

CREATE TABLE control_target (
    target_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    control_id         INT NOT NULL REFERENCES control_material,
    analyte_id         INT NOT NULL REFERENCES analyte,
    assigned_mean      NUMERIC(14,4) NOT NULL,
    assigned_sd        NUMERIC(14,4) NOT NULL,
    lab_mean           NUMERIC(14,4),                 -- locally established after 20 runs
    lab_sd             NUMERIC(14,4),
    cv_target_pct      NUMERIC(6,2),
    UNIQUE (control_id, analyte_id)
);

CREATE TABLE qc_result (
    qc_result_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    control_id         INT NOT NULL REFERENCES control_material,
    analyte_id         INT NOT NULL REFERENCES analyte,
    instrument_id      INT REFERENCES instrument,
    run_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    value              NUMERIC(14,4) NOT NULL,
    z_score            NUMERIC(8,3),
    westgard_violation TEXT,                          -- 1-3s, 2-2s, R-4s, 4-1s, 10x, 1-2s(warn)
    is_accepted        BOOLEAN DEFAULT TRUE,
    operator_id        INT REFERENCES lab_user,
    corrective_action  TEXT,
    patient_results_held BOOLEAN DEFAULT FALSE
);

CREATE TABLE eqa_survey (
    eqa_id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scheme_name        TEXT NOT NULL,                 -- RCPAQAP, WHO malaria slide panel, UK NEQAS
    survey_code        TEXT NOT NULL,
    cycle_year         INT,
    dispatch_date      DATE,
    due_date           DATE,
    submitted_date     DATE,
    submitted_by       INT REFERENCES lab_user,
    overall_outcome    TEXT,                          -- satisfactory / unsatisfactory / not_returned
    action_plan        TEXT
);

CREATE TABLE eqa_result (
    eqa_result_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    eqa_id             INT NOT NULL REFERENCES eqa_survey,
    sample_ref          TEXT,
    analyte_id         INT REFERENCES analyte,
    reported_value     TEXT,
    target_value       TEXT,
    deviation_pct      NUMERIC(8,2),
    outcome            TEXT
);

CREATE TABLE reagent_lot (
    reagent_lot_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reagent_name       TEXT NOT NULL,                 -- CELLPACK DCL, Lysercell, Giemsa stain, anti-A
    manufacturer       TEXT,
    lot_number         TEXT NOT NULL,
    catalogue_number   TEXT,
    received_on        DATE,
    opened_on          DATE,
    expiry_date        DATE,
    quantity_on_hand   NUMERIC(10,2),
    reorder_level      NUMERIC(10,2),                 -- supply chain matters on an island
    qc_verified        BOOLEAN DEFAULT FALSE,
    verified_by        INT REFERENCES lab_user,
    UNIQUE (reagent_name, lot_number)
);

CREATE TABLE maintenance_log (
    maintenance_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_id      INT NOT NULL REFERENCES instrument,
    performed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    maintenance_type   TEXT,                          -- daily / weekly / monthly / corrective / preventive
    task_description   TEXT,
    performed_by       INT REFERENCES lab_user,
    downtime_minutes   INT,
    parts_replaced     TEXT,
    outcome            TEXT
);

-- ==============================================================================
-- 10. REPORTING, NOTIFICATION, INTERFACES
-- ==============================================================================

CREATE TABLE lab_report (
    report_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id         BIGINT NOT NULL REFERENCES lab_request,
    version_no         INT NOT NULL DEFAULT 1,
    is_interim         BOOLEAN DEFAULT FALSE,
    is_amended         BOOLEAN DEFAULT FALSE,
    amendment_note     TEXT,
    generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by       INT REFERENCES lab_user,
    authorised_by      INT REFERENCES lab_user,
    report_body        TEXT,                          -- rendered snapshot: what the clinician actually saw
    UNIQUE (request_id, version_no)
);

CREATE TABLE report_delivery (
    delivery_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id          BIGINT NOT NULL REFERENCES lab_report,
    channel            TEXT NOT NULL,                 -- printed / ward_collection / email / sms / radio / HL7
    destination        TEXT,
    sent_at            TIMESTAMPTZ,
    sent_by            INT REFERENCES lab_user,
    delivery_status    TEXT,
    acknowledged_by    TEXT
);

CREATE TABLE critical_notification (
    notification_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    result_id          BIGINT NOT NULL REFERENCES result,
    detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at        TIMESTAMPTZ,
    minutes_to_notify  INT,                           -- KPI: proportion notified within target
    notified_by        INT REFERENCES lab_user,
    recipient_name     TEXT,
    recipient_role     TEXT,
    contact_method     TEXT,                          -- phone / in_person / radio
    outcome            notify_outcome,
    readback_confirmed BOOLEAN DEFAULT FALSE,         -- repeat-back is the safety step
    escalated_to       TEXT,
    note               TEXT
);

CREATE TABLE interface_message (         -- HL7 v2 / ASTM traffic to and from analysers and the HIS
    message_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    direction          TEXT NOT NULL,                 -- inbound / outbound
    protocol           TEXT,                          -- HL7v2.5.1 / ASTM E1394 / FHIR R4
    message_type       TEXT,                          -- ORM^O01 / ORU^R01 / ADT^A08
    endpoint           TEXT,
    received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    control_id         TEXT,
    payload            TEXT,
    process_status     TEXT,                          -- queued / processed / error
    error_detail       TEXT,
    request_id         BIGINT REFERENCES lab_request
);

CREATE TABLE workload_daily (            -- feeds the monthly return to the Ministry of Health
    workload_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stat_date          DATE NOT NULL,
    section_code       TEXT NOT NULL,
    panel_id           INT REFERENCES test_panel,
    facility_id        INT REFERENCES facility,
    requests_received  INT DEFAULT 0,
    tests_performed    INT DEFAULT 0,
    tests_rejected     INT DEFAULT 0,
    tests_repeated     INT DEFAULT 0,
    criticals_notified INT DEFAULT 0,
    median_tat_mins    INT,
    pct_within_tat     NUMERIC(5,2),
    UNIQUE (stat_date, section_code, panel_id, facility_id)
);

-- ==============================================================================
-- 11. INDEXES
-- ==============================================================================

CREATE INDEX idx_patient_name       ON patient (lower(family_name), lower(given_names));
CREATE INDEX idx_patient_dob        ON patient (date_of_birth);
CREATE INDEX idx_request_patient    ON lab_request (patient_id, requested_at DESC);
CREATE INDEX idx_request_status     ON lab_request (status, priority, requested_at);
CREATE INDEX idx_specimen_request   ON specimen (request_id);
CREATE INDEX idx_specimen_status    ON specimen (status, received_at);
CREATE INDEX idx_result_specimen    ON result (specimen_id);
CREATE INDEX idx_result_analyte     ON result (analyte_id, entered_at DESC);
CREATE INDEX idx_result_critical    ON result (is_critical) WHERE is_critical = TRUE;
CREATE INDEX idx_result_pending     ON result (status) WHERE status IN ('entered','preliminary');
CREATE INDEX idx_malaria_positive   ON malaria_examination (species, examined_at) WHERE asexual_seen = TRUE;
CREATE INDEX idx_unit_available     ON blood_unit (abo, rhd, component, status) WHERE status = 'available';
CREATE INDEX idx_unit_expiry        ON blood_unit (expiry_at) WHERE status IN ('available','reserved');
CREATE INDEX idx_qc_trend           ON qc_result (analyte_id, control_id, run_at DESC);
CREATE INDEX idx_audit_record       ON audit_log (table_name, record_pk, occurred_at DESC);
CREATE INDEX idx_ri_lookup          ON reference_interval (analyte_id, sex, age_low_days, age_high_days);

-- ==============================================================================
-- 12. VIEWS — the queries the lab actually runs every day
-- ==============================================================================

-- Age of the patient at the time of collection, in days: the key to correct
-- paediatric reference intervals. Neonatal ranges differ from adult ranges by
-- more than any other variable in haematology.
CREATE OR REPLACE VIEW v_specimen_context AS
SELECT s.specimen_id, s.specimen_barcode, r.request_id, r.accession_no,
       p.patient_id, p.hospital_number,
       p.family_name || ', ' || p.given_names AS patient_name,
       p.sex, p.date_of_birth,
       (COALESCE(s.collected_at, r.requested_at)::date - p.date_of_birth) AS age_days,
       EXTRACT(YEAR FROM age(COALESCE(s.collected_at, r.requested_at), p.date_of_birth)) AS age_years,
       r.priority, r.status AS request_status, s.status AS specimen_status,
       w.location_name, c.full_name AS clinician_name,
       s.collected_at, s.received_at
FROM specimen s
JOIN lab_request r ON r.request_id = s.request_id
JOIN patient p     ON p.patient_id = r.patient_id
LEFT JOIN ward_location w ON w.location_id = r.location_id
LEFT JOIN clinician c     ON c.clinician_id = r.clinician_id;

-- Everything waiting for a human decision, newest urgent first.
CREATE OR REPLACE VIEW v_validation_queue AS
SELECT ctx.accession_no, ctx.patient_name, ctx.age_years, ctx.priority,
       a.analyte_code, a.analyte_name, res.value_numeric, res.value_text,
       res.unit, res.abnormal_flag, res.is_critical, res.delta_flag,
       res.instrument_flags, res.entered_at
FROM result res
JOIN v_specimen_context ctx ON ctx.specimen_id = res.specimen_id
JOIN analyte a ON a.analyte_id = res.analyte_id
WHERE res.status IN ('entered','preliminary','rerun')
ORDER BY (res.is_critical) DESC,
         array_position(ARRAY['stat','urgent','pre_op','ward_round','routine']::text[],
                        ctx.priority::text),
         res.entered_at;

-- Turnaround time, split at each step, so bottlenecks are visible.
CREATE OR REPLACE VIEW v_turnaround AS
SELECT r.request_id, r.accession_no, r.priority, tp.panel_code,
       EXTRACT(EPOCH FROM (s.collected_at - r.requested_at))/60  AS mins_order_to_collect,
       EXTRACT(EPOCH FROM (s.received_at  - s.collected_at))/60  AS mins_collect_to_receive,
       EXTRACT(EPOCH FROM (MIN(res.entered_at) - s.received_at))/60   AS mins_receive_to_result,
       EXTRACT(EPOCH FROM (MAX(res.validated_at) - MIN(res.entered_at)))/60 AS mins_result_to_release,
       EXTRACT(EPOCH FROM (MAX(res.validated_at) - r.requested_at))/60 AS mins_total
FROM lab_request r
JOIN specimen s        ON s.request_id = r.request_id
JOIN request_panel rp  ON rp.request_id = r.request_id
JOIN test_panel tp     ON tp.panel_id = rp.panel_id
LEFT JOIN result res   ON res.specimen_id = s.specimen_id
GROUP BY r.request_id, r.accession_no, r.priority, tp.panel_code,
         s.collected_at, s.received_at, r.requested_at;

-- Blood stock at a glance, with units about to expire highlighted by days_left.
CREATE OR REPLACE VIEW v_blood_stock AS
SELECT component, abo, rhd, COUNT(*) AS units_available,
       MIN(expiry_at)::date AS earliest_expiry,
       MIN(EXTRACT(DAY FROM (expiry_at - now()))) AS days_to_earliest_expiry
FROM blood_unit
WHERE status IN ('available','reserved')
GROUP BY component, abo, rhd
ORDER BY component, abo, rhd;

-- Malaria surveillance extract for the national programme.
CREATE OR REPLACE VIEW v_malaria_surveillance AS
SELECT m.examined_at::date AS report_date, p.island, p.province, p.village,
       ctx.age_years, p.sex, m.species, m.parasite_density, m.gametocytes,
       m.hyperparasitaemia, m.method, m.notified_program
FROM malaria_examination m
JOIN v_specimen_context ctx ON ctx.specimen_id = m.specimen_id
JOIN patient p ON p.patient_id = ctx.patient_id
WHERE m.asexual_seen = TRUE OR m.gametocytes = TRUE;

COMMIT;

-- ==============================================================================
-- 13. SEED DATA — the haematology test dictionary
--     Reference intervals below are widely used defaults. ISO 15189 requires
--     each laboratory to verify intervals against its own population and
--     methods before use; verified_on is deliberately left NULL until VCH does.
-- ==============================================================================

BEGIN;

INSERT INTO facility (facility_code, facility_name, facility_type, province, island) VALUES
 ('VCH','Vila Central Hospital','National referral','Shefa','Efate'),
 ('NDH','Northern District Hospital','Provincial referral','Sanma','Espiritu Santo'),
 ('LEN','Lenakel Hospital','Provincial','Tafea','Tanna'),
 ('LOL','Lolowai (Godden Memorial) Hospital','Provincial','Penama','Ambae'),
 ('NOR','Norsup Hospital','Provincial','Malampa','Malekula'),
 ('QVS','Qaet Vaes Hospital','Provincial','Torba','Vanua Lava');

INSERT INTO specimen_type (code, name, anticoagulant, tube_colour, default_volume_ml, min_volume_ml, stability_hours, storage_temp) VALUES
 ('WB-EDTA','Whole blood EDTA','K2EDTA','Lavender',4.0,1.0,8,'ambient or 2-8C'),
 ('WB-EDTA-P','Whole blood EDTA paediatric','K2EDTA','Lavender',1.0,0.25,8,'ambient or 2-8C'),
 ('WB-CIT','Whole blood citrate','3.2% sodium citrate','Light blue',2.7,2.4,4,'ambient'),
 ('WB-PLAIN','Whole blood clotted','None','Red/plain',5.0,2.0,24,'2-8C'),
 ('CAP-EDTA','Capillary EDTA microtainer','K2EDTA','Lavender',0.5,0.25,4,'ambient'),
 ('SLIDE','Prepared blood film','None','n/a',NULL,NULL,NULL,'ambient, dust free'),
 ('BM-ASP','Bone marrow aspirate','K2EDTA','Lavender',2.0,0.5,2,'ambient'),
 ('BM-TRE','Bone marrow trephine','Formalin','Pot',NULL,NULL,NULL,'ambient'),
 ('CSF','Cerebrospinal fluid','None','Sterile pot',1.0,0.3,1,'ambient - process immediately'),
 ('FLUID','Serous/synovial fluid','K2EDTA or plain','Lavender/pot',2.0,0.5,2,'2-8C');

INSERT INTO rejection_reason (reason_code, reason_text, is_recollect) VALUES
 ('CLOT','Specimen clotted',TRUE),
 ('QNS','Insufficient volume for the tests requested',TRUE),
 ('HAEM','Grossly haemolysed',TRUE),
 ('UNLAB','Unlabelled specimen',TRUE),
 ('MISLAB','Specimen labelling does not match the request form',TRUE),
 ('WRONGTUBE','Wrong anticoagulant / tube type',TRUE),
 ('UNDERFILL','Citrate tube outside 90-110% fill',TRUE),
 ('LEAK','Leaked or broken in transit',TRUE),
 ('OLD','Received outside the stability window',TRUE),
 ('NOFORM','No request form received',FALSE),
 ('DUP','Duplicate request within the minimum retest interval',FALSE);

-- ---------- Full blood count and derived parameters --------------------------
INSERT INTO analyte (analyte_code, analyte_name, short_name, loinc_code, section_code, datatype, unit, decimal_places, is_calculated, calculation_expr, display_order) VALUES
 ('WBC','White cell count','WBC','6690-2','HAEM','numeric','x10^9/L',1,FALSE,NULL,10),
 ('RBC','Red cell count','RBC','789-8','HAEM','numeric','x10^12/L',2,FALSE,NULL,20),
 ('HGB','Haemoglobin','Hb','718-7','HAEM','numeric','g/L',0,FALSE,NULL,30),
 ('HCT','Haematocrit','Hct','4544-3','HAEM','numeric','L/L',3,FALSE,NULL,40),
 ('MCV','Mean cell volume','MCV','787-2','HAEM','numeric','fL',1,TRUE,'HCT/RBC*1000',50),
 ('MCH','Mean cell haemoglobin','MCH','785-6','HAEM','numeric','pg',1,TRUE,'HGB/RBC',60),
 ('MCHC','Mean cell haemoglobin concentration','MCHC','786-4','HAEM','numeric','g/L',0,TRUE,'HGB/HCT',70),
 ('RDW_CV','Red cell distribution width CV','RDW-CV','788-0','HAEM','numeric','%',1,FALSE,NULL,80),
 ('RDW_SD','Red cell distribution width SD','RDW-SD','21000-5','HAEM','numeric','fL',1,FALSE,NULL,85),
 ('PLT','Platelet count','Plt','777-3','HAEM','numeric','x10^9/L',0,FALSE,NULL,90),
 ('MPV','Mean platelet volume','MPV','32623-1','HAEM','numeric','fL',1,FALSE,NULL,100),
 ('PDW','Platelet distribution width','PDW','32207-3','HAEM','numeric','fL',1,FALSE,NULL,105),
 ('PCT','Plateletcrit','PCT','51637-7','HAEM','numeric','%',2,FALSE,NULL,106),
 ('P_LCR','Platelet large cell ratio','P-LCR',NULL,'HAEM','numeric','%',1,FALSE,NULL,107),
 ('NEUT_PCT','Neutrophils %','Neut%','770-8','HAEM','numeric','%',1,FALSE,NULL,110),
 ('NEUT_ABS','Neutrophils absolute','Neut#','751-8','HAEM','numeric','x10^9/L',2,TRUE,'WBC*NEUT_PCT/100',115),
 ('LYMPH_PCT','Lymphocytes %','Lymph%','736-9','HAEM','numeric','%',1,FALSE,NULL,120),
 ('LYMPH_ABS','Lymphocytes absolute','Lymph#','731-0','HAEM','numeric','x10^9/L',2,TRUE,'WBC*LYMPH_PCT/100',125),
 ('MONO_PCT','Monocytes %','Mono%','5905-5','HAEM','numeric','%',1,FALSE,NULL,130),
 ('MONO_ABS','Monocytes absolute','Mono#','742-7','HAEM','numeric','x10^9/L',2,TRUE,'WBC*MONO_PCT/100',135),
 ('EOS_PCT','Eosinophils %','Eos%','713-8','HAEM','numeric','%',1,FALSE,NULL,140),
 ('EOS_ABS','Eosinophils absolute','Eos#','711-2','HAEM','numeric','x10^9/L',2,TRUE,'WBC*EOS_PCT/100',145),
 ('BASO_PCT','Basophils %','Baso%','706-2','HAEM','numeric','%',1,FALSE,NULL,150),
 ('BASO_ABS','Basophils absolute','Baso#','704-7','HAEM','numeric','x10^9/L',2,TRUE,'WBC*BASO_PCT/100',155),
 ('IG_PCT','Immature granulocytes %','IG%','71695-1','HAEM','numeric','%',1,FALSE,NULL,160),
 ('IG_ABS','Immature granulocytes absolute','IG#','53115-2','HAEM','numeric','x10^9/L',2,FALSE,NULL,165),
 ('NRBC_PCT','Nucleated red cells per 100 WBC','NRBC%','19048-8','HAEM','numeric','/100 WBC',1,FALSE,NULL,170),
 ('NRBC_ABS','Nucleated red cells absolute','NRBC#','58413-6','HAEM','numeric','x10^9/L',2,FALSE,NULL,175),
 ('RET_PCT','Reticulocytes %','Ret%','17849-1','HAEM','numeric','%',2,FALSE,NULL,180),
 ('RET_ABS','Reticulocytes absolute','Ret#','60474-4','HAEM','numeric','x10^9/L',1,TRUE,'RBC*RET_PCT*10',185),
 ('IRF','Immature reticulocyte fraction','IRF',NULL,'HAEM','numeric','%',1,FALSE,NULL,190),
 ('RET_HE','Reticulocyte haemoglobin equivalent','Ret-He',NULL,'HAEM','numeric','pg',1,FALSE,NULL,195),
 ('RPI','Reticulocyte production index','RPI',NULL,'HAEM','numeric','',2,TRUE,'RET_PCT*(HCT/0.45)/maturation',196),
 ('IPF','Immature platelet fraction','IPF',NULL,'HAEM','numeric','%',1,FALSE,NULL,197),
 ('ESR','Erythrocyte sedimentation rate','ESR','30341-2','HAEM','numeric','mm/h',0,FALSE,NULL,200),
 ('MANUAL_HB','Haemoglobin (manual/HemoCue)','Hb man','718-7','HAEM','numeric','g/L',0,FALSE,NULL,205),
 ('PCV_SPUN','Packed cell volume (microhaematocrit)','PCV spun','4544-3','HAEM','numeric','L/L',3,FALSE,NULL,206);

-- ---------- Coagulation ------------------------------------------------------
INSERT INTO analyte (analyte_code, analyte_name, short_name, loinc_code, section_code, datatype, unit, decimal_places, display_order) VALUES
 ('PT','Prothrombin time','PT','5902-2','COAG','numeric','s',1,300),
 ('INR','International normalised ratio','INR','6301-6','COAG','numeric','',2,305),
 ('APTT','Activated partial thromboplastin time','APTT','14979-9','COAG','numeric','s',1,310),
 ('APTT_RATIO','APTT ratio','APTT-R','3173-2','COAG','numeric','',2,315),
 ('TT','Thrombin time','TT','3243-3','COAG','numeric','s',1,320),
 ('FIB','Fibrinogen (Clauss)','Fib','3255-7','COAG','numeric','g/L',1,325),
 ('DDIMER','D-dimer','D-dimer','48065-7','COAG','numeric','mg/L FEU',2,330),
 ('BT','Bleeding time (Ivy)','BT','3183-1','COAG','numeric','min',1,335),
 ('CT_WBCT','Whole blood clotting time (20 min WBCT)','WBCT20',NULL,'COAG','coded',NULL,0,340),
 ('MIX_STUDY','Mixing study interpretation','Mix',NULL,'COAG','text',NULL,0,345);

-- ---------- Malaria / parasitology on blood ---------------------------------
INSERT INTO analyte (analyte_code, analyte_name, short_name, loinc_code, section_code, datatype, unit, decimal_places, display_order) VALUES
 ('MAL_SCREEN','Malaria parasites (thick and thin film)','MPs','32700-7','MALARIA','coded',NULL,0,400),
 ('MAL_SPECIES','Plasmodium species','Species','32206-5','MALARIA','coded',NULL,0,405),
 ('MAL_DENS','Asexual parasite density','Density','51587-4','MALARIA','numeric','/uL',0,410),
 ('MAL_PCT','Parasitaemia','Parasitaemia','30435-2','MALARIA','numeric','%',3,415),
 ('MAL_GAM','Gametocytes seen','Gametocytes',NULL,'MALARIA','boolean',NULL,0,420),
 ('MAL_RDT','Malaria rapid diagnostic test','MRDT','70564-0','MALARIA','coded',NULL,0,425),
 ('MICROFIL','Microfilariae (night blood)','Mf','32206-5','MALARIA','coded',NULL,0,430);

-- ---------- Transfusion ------------------------------------------------------
INSERT INTO analyte (analyte_code, analyte_name, short_name, loinc_code, section_code, datatype, unit, decimal_places, display_order) VALUES
 ('ABO','ABO group','ABO','883-9','BB','coded',NULL,0,500),
 ('RHD','RhD type','RhD','10331-7','BB','coded',NULL,0,505),
 ('AB_SCREEN','Antibody screen','Ab screen','890-4','BB','coded',NULL,0,510),
 ('DAT','Direct antiglobulin test','DAT','1006-2','BB','coded',NULL,0,515),
 ('XM','Crossmatch result','XM','882-1','BB','coded',NULL,0,520);

-- ---------- Coded value sets -------------------------------------------------
INSERT INTO coded_value (set_code, value_code, display_text, numeric_rank, display_order, is_abnormal) VALUES
 ('GRADE','0','Not seen',0,1,FALSE),
 ('GRADE','1','1+ (occasional)',1,2,TRUE),
 ('GRADE','2','2+ (moderate)',2,3,TRUE),
 ('GRADE','3','3+ (many)',3,4,TRUE),
 ('GRADE','4','4+ (marked)',4,5,TRUE),
 ('POSNEG','NEG','Negative',0,1,FALSE),
 ('POSNEG','POS','Positive',1,2,TRUE),
 ('POSNEG','IND','Indeterminate - repeat',NULL,3,TRUE),
 ('MALSP','NONE','No malaria parasites seen',0,1,FALSE),
 ('MALSP','PF','Plasmodium falciparum',1,2,TRUE),
 ('MALSP','PV','Plasmodium vivax',2,3,TRUE),
 ('MALSP','PM','Plasmodium malariae',3,4,TRUE),
 ('MALSP','PO','Plasmodium ovale',4,5,TRUE),
 ('MALSP','MIX','Mixed infection',5,6,TRUE),
 ('MALSP','UNK','Parasites seen, species not determined',6,7,TRUE),
 ('RBCSIZE','NORMO','Normocytic',NULL,1,FALSE),
 ('RBCSIZE','MICRO','Microcytic',NULL,2,TRUE),
 ('RBCSIZE','MACRO','Macrocytic',NULL,3,TRUE),
 ('RBCSIZE','DIMORPH','Dimorphic',NULL,4,TRUE),
 ('ADEQ','DEC','Decreased',NULL,1,TRUE),
 ('ADEQ','ADQ','Adequate',NULL,2,FALSE),
 ('ADEQ','INC','Increased',NULL,3,TRUE);

-- ---------- Orderable panels -------------------------------------------------
INSERT INTO test_panel (panel_code, panel_name, section_code, specimen_type_id, tat_routine_mins, tat_urgent_mins, requires_clin_info, patient_prep_note) VALUES
 ('FBC','Full blood count','HAEM',1,240,60,FALSE,NULL),
 ('FBC_DIFF','Full blood count with manual differential','HAEM',1,360,90,FALSE,NULL),
 ('FILM','Blood film examination','MORPH',1,480,120,TRUE,NULL),
 ('RETIC','Reticulocyte count','HAEM',1,360,120,FALSE,NULL),
 ('ESR','Erythrocyte sedimentation rate','HAEM',1,240,NULL,FALSE,'Test within 4 hours of collection'),
 ('MPS','Malaria parasites (film and RDT)','MALARIA',1,60,30,TRUE,'Collect during or close to a fever spike where possible'),
 ('MFIL','Microfilariae, night blood','MALARIA',1,720,NULL,TRUE,'Collect between 22:00 and 02:00'),
 ('COAG','Coagulation screen (PT, INR, APTT, Fib)','COAG',3,240,60,TRUE,'Citrate tube must be filled to the mark'),
 ('INR_ONLY','INR (warfarin monitoring)','COAG',3,180,60,TRUE,'Record current warfarin dose'),
 ('DDIM','D-dimer','COAG',3,240,60,TRUE,NULL),
 ('GS','Group and screen','BB',1,120,45,TRUE,NULL),
 ('GXM','Group, screen and crossmatch','BB',1,180,45,TRUE,'State number of units and indication'),
 ('DCT','Direct antiglobulin test','BB',1,180,60,TRUE,NULL),
 ('ANC_GROUP','Antenatal group and antibody screen','BB',1,480,NULL,TRUE,NULL),
 ('SICKLE','Sickle solubility screen','HAEM',1,480,NULL,FALSE,NULL),
 ('G6PD','G6PD screen','HAEM',1,720,NULL,TRUE,'Not reliable during or soon after acute haemolysis'),
 ('HBEP','Haemoglobin electrophoresis','HAEM',1,4320,NULL,TRUE,NULL),
 ('CSFCC','CSF cell count and differential','HAEM',9,60,30,TRUE,'Deliver to the laboratory immediately'),
 ('FLUIDCC','Body fluid cell count','HAEM',10,180,60,TRUE,NULL),
 ('BMA','Bone marrow aspirate','MORPH',7,10080,NULL,TRUE,'Book with the laboratory before the procedure');

COMMIT;

-- ==============================================================================
-- 14. REFERENCE INTERVALS (defaults pending local verification)
--     age_low_days / age_high_days let one analyte carry a full paediatric
--     ladder. Neonatal values are deliberately included: VCH runs a maternity
--     and paediatric service and adult ranges misclassify newborns badly.
-- ==============================================================================

BEGIN;

-- Haemoglobin g/L
INSERT INTO reference_interval (analyte_id, sex, age_low_days, age_high_days, lower_limit, upper_limit, source_reference)
SELECT analyte_id, NULL,   0,     1,  145, 225, 'Neonatal, day 0-1' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id, NULL,   2,    14,  135, 215, 'Neonatal, day 2-14' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id, NULL,  15,    60,  100, 180, 'Infant, 2 wk - 2 mo (physiological nadir)' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id, NULL,  61,   365,   95, 130, 'Infant, 2 - 12 mo' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id, NULL, 366,  2190,  105, 135, 'Child, 1 - 6 y' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id, NULL,2191,  4380,  115, 145, 'Child, 6 - 12 y' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id,'male',4381,43800,  130, 180, 'Adult male' FROM analyte WHERE analyte_code='HGB'
UNION ALL SELECT analyte_id,'female',4381,43800,115, 165, 'Adult female' FROM analyte WHERE analyte_code='HGB';

-- White cell count x10^9/L
INSERT INTO reference_interval (analyte_id, sex, age_low_days, age_high_days, lower_limit, upper_limit, source_reference)
SELECT analyte_id, NULL,   0,    1,  9.0, 30.0, 'Neonatal day 0-1' FROM analyte WHERE analyte_code='WBC'
UNION ALL SELECT analyte_id, NULL,   2,   28,  5.0, 21.0, 'Neonate' FROM analyte WHERE analyte_code='WBC'
UNION ALL SELECT analyte_id, NULL,  29,  730,  6.0, 17.5, 'Infant' FROM analyte WHERE analyte_code='WBC'
UNION ALL SELECT analyte_id, NULL, 731, 4380,  5.0, 15.0, 'Child 2 - 12 y' FROM analyte WHERE analyte_code='WBC'
UNION ALL SELECT analyte_id, NULL,4381,43800,  4.0, 11.0, 'Adult' FROM analyte WHERE analyte_code='WBC';

-- Remaining adult intervals
INSERT INTO reference_interval (analyte_id, sex, age_low_days, age_high_days, lower_limit, upper_limit, source_reference)
SELECT a.analyte_id, v.sex::sex_at_birth, v.lo, v.hi, v.ll, v.ul, v.src
FROM (VALUES
 ('RBC',      'male',   4381, 43800,  4.50,   6.50, 'Adult male'),
 ('RBC',      'female', 4381, 43800,  3.80,   5.80, 'Adult female'),
 ('RBC',      NULL,        0,  4380,  3.60,   5.50, 'Paediatric composite'),
 ('HCT',      'male',   4381, 43800,  0.400,  0.540,'Adult male'),
 ('HCT',      'female', 4381, 43800,  0.360,  0.470,'Adult female'),
 ('HCT',      NULL,        0,  4380,  0.330,  0.450,'Paediatric composite'),
 ('MCV',      NULL,     4381, 43800, 80.0,  100.0, 'Adult'),
 ('MCV',      NULL,      366,  4380, 73.0,   90.0, 'Child 1 - 12 y'),
 ('MCV',      NULL,        0,   365, 85.0,  110.0, 'Infant'),
 ('MCH',      NULL,     4381, 43800, 27.0,   32.0, 'Adult'),
 ('MCHC',     NULL,        0, 43800,320.0,  360.0, 'All ages'),
 ('RDW_CV',   NULL,        0, 43800, 11.5,   14.5, 'All ages'),
 ('RDW_SD',   NULL,        0, 43800, 37.0,   54.0, 'All ages'),
 ('PLT',      NULL,        0, 43800,150.0,  400.0, 'All ages'),
 ('MPV',      NULL,        0, 43800,  7.5,   11.5, 'All ages'),
 ('PDW',      NULL,        0, 43800,  9.0,   17.0, 'All ages'),
 ('PCT',      NULL,        0, 43800,  0.17,   0.35, 'All ages'),
 ('NEUT_ABS', NULL,     4381, 43800,  2.00,   7.50, 'Adult'),
 ('NEUT_ABS', NULL,      366,  4380,  1.50,   8.50, 'Child'),
 ('LYMPH_ABS',NULL,     4381, 43800,  1.00,   4.00, 'Adult'),
 ('LYMPH_ABS',NULL,      366,  4380,  1.50,   9.50, 'Child'),
 ('MONO_ABS', NULL,        0, 43800,  0.20,   0.80, 'All ages'),
 ('EOS_ABS',  NULL,        0, 43800,  0.04,   0.40, 'All ages - raised counts are common where helminths are endemic'),
 ('BASO_ABS', NULL,        0, 43800,  0.01,   0.10, 'All ages'),
 ('IG_ABS',   NULL,        0, 43800,  0.00,   0.07, 'All ages'),
 ('NRBC_ABS', NULL,       29, 43800,  0.00,   0.00, 'Beyond the neonatal period any NRBC is abnormal'),
 ('RET_PCT',  NULL,     4381, 43800,  0.50,   2.50, 'Adult'),
 ('RET_ABS',  NULL,     4381, 43800, 20.0,  100.0, 'Adult'),
 ('IRF',      NULL,        0, 43800,  2.0,   12.0, 'All ages'),
 ('RET_HE',   NULL,        0, 43800, 28.0,   36.0, 'All ages'),
 ('IPF',      NULL,        0, 43800,  1.0,    5.0, 'All ages'),
 ('ESR',      'male',   4381, 43800,  0.0,   15.0, 'Adult male, Westergren'),
 ('ESR',      'female', 4381, 43800,  0.0,   20.0, 'Adult female, Westergren'),
 ('PT',       NULL,        0, 43800, 11.0,   14.0, 'Method and reagent dependent - verify locally'),
 ('INR',      NULL,        0, 43800,  0.80,   1.20, 'Untreated patient'),
 ('APTT',     NULL,        0, 43800, 25.0,   38.0, 'Method and reagent dependent - verify locally'),
 ('APTT_RATIO',NULL,       0, 43800,  0.80,   1.20, 'Ratio to mean normal'),
 ('TT',       NULL,        0, 43800, 14.0,   19.0, 'Method dependent'),
 ('FIB',      NULL,        0, 43800,  2.00,   4.00, 'Clauss method'),
 ('DDIMER',   NULL,        0, 43800,  0.00,   0.50, 'Exclusion threshold; rises with age and pregnancy')
) AS v(code, sex, lo, hi, ll, ul, src)
JOIN analyte a ON a.analyte_code = v.code;

-- ---------- Critical (alert) limits -----------------------------------------
INSERT INTO critical_limit (analyte_id, sex, age_low_days, age_high_days, critical_low, critical_high, notify_within_mins, action_note)
SELECT a.analyte_id, NULL, v.lo, v.hi, v.cl, v.ch, 30, v.note
FROM (VALUES
 ('HGB',       0,    28,  100.0,  240.0, 'Neonatal anaemia or polycythaemia'),
 ('HGB',      29, 43800,   70.0,  200.0, 'WHO severe anaemia threshold in children is 70 g/L'),
 ('WBC',       0, 43800,    1.0,   50.0, 'Consider leukaemia or profound marrow failure'),
 ('NEUT_ABS',  0, 43800,    0.5,   NULL, 'Neutropenic sepsis risk - notify before the patient leaves'),
 ('PLT',       0, 43800,   20.0, 1000.0, 'Bleeding or thrombotic risk'),
 ('HCT',       0, 43800,    0.20,   0.60, 'Transfusion or hyperviscosity threshold'),
 ('INR',       0, 43800,   NULL,    5.0, 'Warfarin over-anticoagulation'),
 ('APTT',      0, 43800,   NULL,  100.0, 'Consider heparin excess or inhibitor'),
 ('FIB',       0, 43800,    1.0,   NULL, 'Consider DIC or massive haemorrhage'),
 ('MAL_DENS',  0, 43800,   NULL,100000.0,'Hyperparasitaemia - treat as severe malaria')
) AS v(code, lo, hi, cl, ch, note)
JOIN analyte a ON a.analyte_code = v.code;

-- ---------- Delta check rules ------------------------------------------------
INSERT INTO delta_check_rule (analyte_id, lookback_hours, abs_change_limit, pct_change_limit, action)
SELECT a.analyte_id, v.hrs, v.abs_lim, v.pct_lim, v.act
FROM (VALUES
 ('HGB',  72,  20.0, 20.0, 'hold_for_review'),
 ('WBC',  72,  NULL, 50.0, 'hold_for_review'),
 ('PLT',  72,  NULL, 50.0, 'hold_for_review'),
 ('MCV', 720,   5.0, NULL, 'comment_only'),
 ('INR',  48,   1.5, NULL, 'hold_for_review')
) AS v(code, hrs, abs_lim, pct_lim, act)
JOIN analyte a ON a.analyte_code = v.code;

-- ---------- Reflex rules -----------------------------------------------------
INSERT INTO reflex_rule (trigger_analyte, operator, threshold_low, threshold_high, add_panel_id, rule_note)
SELECT a.analyte_id, v.op, v.tl, v.th, p.panel_id, v.note
FROM (VALUES
 ('PLT','<',      NULL, 100.0, 'FILM','Thrombocytopenia: confirm on film and exclude clumping'),
 ('PLT','<',      NULL, 100.0, 'MPS', 'Thrombocytopenia with fever is malaria or dengue until proven otherwise'),
 ('WBC','>',      NULL,  30.0, 'FILM','Marked leucocytosis: film review'),
 ('WBC','<',       2.0,  NULL, 'FILM','Leucopenia: film review'),
 ('HGB','<',      70.0,  NULL, 'RETIC','Severe anaemia: classify the marrow response'),
 ('MCV','<',      70.0,  NULL, 'FILM','Microcytosis: exclude iron deficiency and thalassaemia')
) AS v(code, op, tl, th, panel, note)
JOIN analyte a ON a.analyte_code = v.code
JOIN test_panel p ON p.panel_code = v.panel;

-- ---------- Interpretive comment library ------------------------------------
INSERT INTO comment_library (comment_code, section_code, comment_text) VALUES
 ('MICRO_HYPO','MORPH','Microcytic hypochromic red cell picture. Iron deficiency and alpha thalassaemia trait are both common locally; iron studies and, where available, haemoglobin studies are suggested for classification.'),
 ('MAL_POS','MALARIA','Malaria parasites seen. Result telephoned to the requesting clinician. This is a notifiable result and has been forwarded to the malaria programme.'),
 ('PLT_CLUMP','HAEM','Platelet clumps present on the film. The instrument platelet count is falsely low; a citrate or repeat sample is suggested.'),
 ('NEUTROPENIA','HAEM','Significant neutropenia. Please assess for infection; result telephoned.'),
 ('EOS_HIGH','HAEM','Eosinophilia. Consider intestinal helminths, strongyloides, scabies or drug reaction.'),
 ('SPECIMEN_AGE','HAEM','Sample analysed outside the recommended stability window. Cell indices, in particular MCV and platelet count, should be interpreted with caution.'),
 ('G6PD_CAUTION','HAEM','G6PD screening is unreliable during and shortly after an acute haemolytic episode or after transfusion. Repeat testing after three months is suggested.');

COMMIT;

-- ==============================================================================
-- END OF SCHEMA
-- Retention guidance for the laboratory quality manual:
--   patient, lab_request, result, lab_report ......... retain indefinitely
--   blood_unit, crossmatch, unit_issue, transfusion ... 30 years (traceability)
--   audit_log ......................................... 10 years, append only
--   qc_result, eqa_result, maintenance_log ............ 5 years
--   specimen (physical) ............................... EDTA 24-48 h; slides 1 year;
--                                                       transfusion samples 7 days at 2-8C
-- ==============================================================================
