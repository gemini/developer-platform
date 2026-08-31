package cli

import (
	"fmt"
	"strings"
	"time"

	"github.com/gemini/developer-platform/packages/gemini-markets-cli/internal/output"
	"github.com/gemini/developer-platform/packages/sdk-go/generated/predictions"
	"github.com/spf13/cobra"
)

func newPublicPredictionMarketsCommand(publicFactory, authenticatedFactory PublicServiceFactory) *cobra.Command {
	command := &cobra.Command{
		Use:     "prediction-markets",
		Aliases: []string{"predictions", "prediction"},
		Short:   "Prediction-market discovery and terms",
		Args:    cobra.NoArgs,
	}
	command.AddCommand(
		newPublicPredictionListCommand(publicFactory),
		newPublicPredictionGetCommand(publicFactory),
		newPredictionTermsCommand(publicFactory, authenticatedFactory),
	)
	return command
}

func newPublicPredictionListCommand(factory PublicServiceFactory) *cobra.Command {
	var (
		statuses      []string
		categories    []string
		sports        []string
		marketTypes   []string
		subjects      []string
		scopes        []string
		metrics       []string
		search        string
		limit, offset int
	)
	command := &cobra.Command{
		Use:     "list",
		Aliases: []string{"events"},
		Short:   "List prediction-market events",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			params, err := listEventsParams(statuses, categories, sports, marketTypes, subjects, scopes, metrics, search, limit, offset)
			if err != nil {
				return err
			}
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.Predictions == nil {
					return fmt.Errorf("prediction markets service is unavailable")
				}
				events, err := services.Predictions.GetEvents(cmd.Context(), params)
				if err != nil {
					return fmt.Errorf("list prediction-market events: %w", err)
				}
				return writePublicResult(cmd, events, eventsTable(events))
			})
		},
	}
	command.Flags().StringSliceVar(&statuses, "status", nil, "event status filter (repeatable: active, approved, closed, invalid, settled, under_review)")
	command.Flags().StringSliceVar(&categories, "category", nil, "event category filter (repeatable)")
	command.Flags().StringSliceVar(&sports, "sport", nil, "sports-market sport filter (repeatable)")
	command.Flags().StringSliceVar(&marketTypes, "sports-market-type", nil, "sports-market type filter (repeatable)")
	command.Flags().StringSliceVar(&subjects, "sports-market-subject", nil, "sports-market subject filter (repeatable)")
	command.Flags().StringSliceVar(&scopes, "sports-market-scope", nil, "sports-market scope filter (repeatable)")
	command.Flags().StringSliceVar(&metrics, "sports-market-metric", nil, "sports-market metric filter (repeatable)")
	command.Flags().StringVar(&search, "search", "", "search event titles")
	command.Flags().IntVar(&limit, "limit", -1, "maximum events to return (0-500; -1 omits the parameter)")
	command.Flags().IntVar(&offset, "offset", -1, "number of events to skip (-1 omits the parameter)")
	return command
}

func newPublicPredictionGetCommand(factory PublicServiceFactory) *cobra.Command {
	return &cobra.Command{
		Use:   "get EVENT_TICKER",
		Short: "Get one prediction-market event and its contracts",
		Args:  oneNonEmptyArgument("event ticker"),
		RunE: func(cmd *cobra.Command, args []string) error {
			ticker := strings.TrimSpace(args[0])
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.Predictions == nil {
					return fmt.Errorf("prediction markets service is unavailable")
				}
				event, err := services.Predictions.GetEvent(cmd.Context(), ticker)
				if err != nil {
					return fmt.Errorf("get prediction-market event %s: %w", ticker, err)
				}
				return writePublicResult(cmd, event, eventTable(event))
			})
		},
	}
}

func newPredictionTermsCommand(publicFactory, authenticatedFactory PublicServiceFactory) *cobra.Command {
	command := &cobra.Command{
		Use:   "terms",
		Short: "Read and manage prediction-market terms",
		Args:  cobra.NoArgs,
	}
	command.AddCommand(
		newPredictionTermsShowCommand(publicFactory),
		newPredictionTermsStatusCommand(authenticatedFactory),
		newPredictionTermsAcceptCommand(authenticatedFactory),
	)
	return command
}

func newPredictionTermsShowCommand(factory PublicServiceFactory) *cobra.Command {
	return &cobra.Command{
		Use:     "show",
		Aliases: []string{"view"},
		Short:   "Show the latest prediction-market terms",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.Predictions == nil {
					return fmt.Errorf("prediction markets service is unavailable")
				}
				terms, err := services.Predictions.GetTerms(cmd.Context())
				if err != nil {
					return fmt.Errorf("get prediction-market terms: %w", err)
				}
				return writePredictionTerms(cmd, terms)
			})
		},
	}
}

func newPredictionTermsStatusCommand(factory PublicServiceFactory) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show prediction-market terms acceptance status",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.Predictions == nil {
					return fmt.Errorf("prediction markets service is unavailable")
				}
				status, err := services.Predictions.GetTermsStatus(cmd.Context())
				if err != nil {
					return fmt.Errorf("get prediction-market terms status: %w", err)
				}
				return writePublicResult(cmd, status, predictionTermsStatusTable(status))
			})
		},
	}
}

func newPredictionTermsAcceptCommand(factory PublicServiceFactory) *cobra.Command {
	var yes bool
	command := &cobra.Command{
		Use:     "accept",
		Short:   "Explicitly accept the latest prediction-market terms",
		Long:    "Accept the latest prediction-market terms for the authenticated account group. Read the terms with gemini-markets prediction-markets terms show before accepting them.",
		Example: "  gemini-markets prediction-markets terms accept --yes",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !yes {
				return fmt.Errorf("accepting prediction-market terms requires --yes; review them with `gemini-markets prediction-markets terms show`")
			}
			return withPublicServices(cmd, factory, func(services PublicServices) error {
				if services.Predictions == nil {
					return fmt.Errorf("prediction markets service is unavailable")
				}
				response, err := services.Predictions.AcceptTerms(cmd.Context())
				if err != nil {
					return fmt.Errorf("accept prediction-market terms: %w", err)
				}
				return writePublicResult(cmd, response, predictionTermsAcceptanceTable(response))
			})
		},
	}
	command.Flags().BoolVar(&yes, "yes", false, "confirm acceptance of the latest terms")
	return command
}

func listEventsParams(statuses, categories, sports, marketTypes, subjects, scopes, metrics []string, search string, limit, offset int) (*predictions.ListEventsParams, error) {
	if err := validateLimitOffset(limit, offset); err != nil {
		return nil, err
	}
	parsedStatuses, err := parseMarketStatuses(statuses)
	if err != nil {
		return nil, err
	}
	parsedCategories, err := cleanValues("category", categories)
	if err != nil {
		return nil, err
	}
	parsedSports, err := parseEnumValues[predictions.SportsMarketSport]("sport", sports)
	if err != nil {
		return nil, err
	}
	parsedMarketTypes, err := parseEnumValues[predictions.SportsMarketType]("sports-market-type", marketTypes)
	if err != nil {
		return nil, err
	}
	parsedSubjects, err := parseEnumValues[predictions.SportsMarketSubject]("sports-market-subject", subjects)
	if err != nil {
		return nil, err
	}
	parsedScopes, err := parseEnumValues[predictions.SportsMarketScopeType]("sports-market-scope", scopes)
	if err != nil {
		return nil, err
	}
	parsedMetrics, err := parseEnumValues[predictions.SportsMarketMetric]("sports-market-metric", metrics)
	if err != nil {
		return nil, err
	}

	params := &predictions.ListEventsParams{}
	if len(parsedStatuses) > 0 {
		params.Status = &parsedStatuses
	}
	if len(parsedCategories) > 0 {
		params.Category = &parsedCategories
	}
	if len(parsedSports) > 0 {
		values := predictions.SportFilter(parsedSports)
		params.Sport = &values
	}
	if len(parsedMarketTypes) > 0 {
		values := predictions.SportsMarketTypeFilter(parsedMarketTypes)
		params.SportsMarketType = &values
	}
	if len(parsedSubjects) > 0 {
		values := predictions.SportsMarketSubjectFilter(parsedSubjects)
		params.SportsMarketSubject = &values
	}
	if len(parsedScopes) > 0 {
		values := predictions.SportsMarketScopeFilter(parsedScopes)
		params.SportsMarketScope = &values
	}
	if len(parsedMetrics) > 0 {
		values := predictions.SportsMarketMetricFilter(parsedMetrics)
		params.SportsMarketMetric = &values
	}
	if value := strings.TrimSpace(search); value != "" {
		params.Search = &value
	}
	if limit >= 0 {
		params.Limit = &limit
	}
	if offset >= 0 {
		params.Offset = &offset
	}
	if paramsEmpty(params) {
		return nil, nil
	}
	return params, nil
}

func paramsEmpty(params *predictions.ListEventsParams) bool {
	return params == nil || (params.Status == nil && params.Category == nil && params.Sport == nil &&
		params.SportsMarketType == nil && params.SportsMarketSubject == nil && params.SportsMarketScope == nil &&
		params.SportsMarketMetric == nil && params.Search == nil && params.Limit == nil && params.Offset == nil)
}

func validateLimitOffset(limit, offset int) error {
	if limit < -1 || limit > 500 {
		return fmt.Errorf("limit must be -1 (omit) or between 0 and 500")
	}
	if offset < -1 {
		return fmt.Errorf("offset must be -1 (omit) or non-negative")
	}
	return nil
}

func parseMarketStatuses(values []string) ([]predictions.MarketStatus, error) {
	cleaned, err := cleanValues("status", values)
	if err != nil {
		return nil, err
	}
	parsed := make([]predictions.MarketStatus, 0, len(cleaned))
	for _, value := range cleaned {
		status := predictions.MarketStatus(strings.ToLower(value))
		switch status {
		case predictions.MarketStatusActive, predictions.MarketStatusApproved, predictions.MarketStatusClosed,
			predictions.MarketStatusInvalid, predictions.MarketStatusSettled, predictions.MarketStatusUnderReview:
			parsed = append(parsed, status)
		default:
			return nil, fmt.Errorf("invalid status %q", value)
		}
	}
	return parsed, nil
}

func cleanValues(name string, values []string) ([]string, error) {
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			return nil, fmt.Errorf("%s values must not be empty", name)
		}
		cleaned = append(cleaned, value)
	}
	return cleaned, nil
}

type validEnum interface {
	~string
	Valid() bool
}

func parseEnumValues[T validEnum](name string, values []string) ([]T, error) {
	cleaned, err := cleanValues(name, values)
	if err != nil {
		return nil, err
	}
	parsed := make([]T, 0, len(cleaned))
	for _, value := range cleaned {
		enumValue := T(value)
		if !enumValue.Valid() {
			return nil, fmt.Errorf("invalid %s %q", name, value)
		}
		parsed = append(parsed, enumValue)
	}
	return parsed, nil
}

func eventsTable(events *predictions.EventsResponse) output.TableData {
	table := output.TableData{Headers: []string{"TICKER", "TITLE", "CATEGORY", "STATUS", "TYPE", "VOLUME", "LIQUIDITY"}}
	if events == nil || events.Data == nil {
		return table
	}
	for _, event := range *events.Data {
		table.Rows = append(table.Rows, []string{
			publicStringValue(event.Ticker), publicStringValue(event.Title), publicStringValue(event.Category), enumValue(event.Status),
			enumValue(event.Type), publicStringValue(event.Volume), publicStringValue(event.Liquidity),
		})
	}
	return table
}

func eventTable(event *predictions.Event) output.TableData {
	headers := []string{"TICKER", "TITLE", "CATEGORY", "STATUS", "TYPE", "VOLUME", "LIQUIDITY", "CONTRACT"}
	table := output.TableData{Headers: headers}
	if event == nil {
		return table
	}
	base := []string{publicStringValue(event.Ticker), publicStringValue(event.Title), publicStringValue(event.Category), enumValue(event.Status), enumValue(event.Type), publicStringValue(event.Volume), publicStringValue(event.Liquidity)}
	if event.Contracts == nil || len(*event.Contracts) == 0 {
		table.Rows = append(table.Rows, append(base, ""))
		return table
	}
	for _, contract := range *event.Contracts {
		table.Rows = append(table.Rows, append(base, publicStringValue(contract.InstrumentSymbol)))
	}
	return table
}

func predictionTermsStatusTable(status *predictions.PredictionMarketsTermsStatus) output.TableData {
	if status == nil {
		return output.TableData{Headers: []string{"ACCEPTED_VERSION", "HAS_ACCEPTED_LATEST", "LATEST_VERSION"}}
	}
	acceptedVersion, latestVersion := "", ""
	if status.AcceptedVersion != nil {
		acceptedVersion = fmt.Sprintf("%d", *status.AcceptedVersion)
	}
	if status.LatestVersion != nil {
		latestVersion = fmt.Sprintf("%d", *status.LatestVersion)
	}
	return output.TableData{
		Headers: []string{"ACCEPTED_VERSION", "HAS_ACCEPTED_LATEST", "LATEST_VERSION"},
		Rows:    [][]string{{acceptedVersion, fmt.Sprintf("%t", status.HasAcceptedLatest), latestVersion}},
	}
}

func writePredictionTerms(cmd *cobra.Command, terms *predictions.PredictionMarketsTerms) error {
	if Options(cmd).Format == output.JSON {
		return output.Write(cmd.OutOrStdout(), terms, output.JSON)
	}
	if terms == nil {
		return output.Write(cmd.OutOrStdout(), output.TableData{Headers: []string{"VERSION", "TERMS TYPE", "UPDATED AT"}}, output.Table)
	}
	updatedAt := ""
	if !terms.UpdatedAt.IsZero() {
		updatedAt = terms.UpdatedAt.Format(time.RFC3339)
	}
	if err := output.Write(cmd.OutOrStdout(), output.TableData{
		Headers: []string{"VERSION", "TERMS TYPE", "UPDATED AT"},
		Rows:    [][]string{{fmt.Sprintf("%d", terms.Version), terms.TermsType, updatedAt}},
	}, output.Table); err != nil {
		return err
	}
	content := strings.TrimRight(terms.Content, "\r\n")
	if content == "" {
		return nil
	}
	_, err := fmt.Fprintf(cmd.OutOrStdout(), "\n%s\n", content)
	return err
}

func predictionTermsAcceptanceTable(response *predictions.AcceptPredictionMarketsTermsResponse) output.TableData {
	if response == nil {
		return output.TableData{Headers: []string{"SUCCESS"}}
	}
	return output.TableData{Headers: []string{"SUCCESS"}, Rows: [][]string{{fmt.Sprintf("%t", response.Success)}}}
}

func enumValue[T ~string](value *T) string {
	if value == nil {
		return ""
	}
	return string(*value)
}

func timeValue(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format(time.RFC3339)
}
