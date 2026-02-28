import {
	consensusIdenticalAggregation,
	cre,
	Runner,
	type HTTPSendRequester,
	type Runtime,
	type CronPayload,
} from '@chainlink/cre-sdk';
import { z } from 'zod';

// ---------- Config ----------

const configSchema = z.object({
	// e.g. "0 */30 * * * *" (every 30 minutes, at second 0)
	schedule: z.string(),
	// Snapshot GraphQL endpoint
	snapshotGraphqlUrl: z.string(),
	// Snapshot spaces to monitor
	snapshotSpaces: z.array(z.string()),
	// Discourse forum base URL
	forumBaseUrl: z.string(),
	// Number of recent forum topics to fetch
	forumTopicCount: z.number().default(10),
	// Optional webhook
	webhook: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		bearerToken: z.string().optional(),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

// ---------- Types ----------

type SnapshotProposal = {
	id: string;
	title: string;
	start: number;
	end: number;
	state: string;
	choices: string[];
	scores: number[];
	scores_total: number;
	votes: number;
	author: string;
	space: { id: string; name: string };
};

type SnapshotGraphQLResponse = {
	data?: {
		proposals?: SnapshotProposal[];
	};
	errors?: Array<{ message: string }>;
};

type ForumTopic = {
	id: number;
	title: string;
	slug: string;
	posts_count: number;
	last_posted_at: string;
};

type ForumLatestResponse = {
	topic_list?: {
		topics?: ForumTopic[];
	};
};

type GovernanceProposal = {
	id: string;
	title: string;
	space: string;
	state: string;
	start: number;
	end: number;
	votes: number;
	scores_total: number;
	choices: string[];
	scores: number[];
	author: string;
	hoursRemaining: number | null;
	isUrgent: boolean;
};

type GovernanceForumTopic = {
	id: number;
	title: string;
	slug: string;
	postsCount: number;
	lastPostedAt: string;
	url: string;
};

type GovernanceOutputPayload = {
	timestamp: string;
	proposals: GovernanceProposal[];
	forumTopics: GovernanceForumTopic[];
	summary: {
		activeProposals: number;
		urgentProposals: number;
		closingSoon24h: number;
		forumNewTopics: number;
	};
};

// ---------- Helpers ----------

// Safely stringify BigInt
const safeJsonStringify = (obj: unknown) =>
	JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

const SNAPSHOT_PROPOSALS_QUERY = `
query Proposals($spaces: [String!]!) {
  proposals(
    first: 20,
    where: { space_in: $spaces },
    orderBy: "created",
    orderDirection: desc
  ) {
    id
    title
    start
    end
    state
    choices
    scores
    scores_total
    votes
    author
    space { id name }
  }
}
`;

function fetchSnapshotProposals(
	sendRequester: HTTPSendRequester,
	args: { url: string; spaces: string[] },
): SnapshotProposal[] {
	const body = JSON.stringify({
		query: SNAPSHOT_PROPOSALS_QUERY,
		variables: { spaces: args.spaces },
	});

	const resp = sendRequester
		.sendRequest({
			method: 'POST',
			url: args.url,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: Buffer.from(body).toString('base64'),
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`Snapshot GraphQL request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(
		Buffer.from(resp.body).toString('utf-8'),
	) as SnapshotGraphQLResponse;

	if (decoded.errors && decoded.errors.length > 0) {
		throw new Error(`Snapshot GraphQL errors: ${decoded.errors.map((e) => e.message).join(', ')}`);
	}

	return decoded.data?.proposals ?? [];
}

function fetchForumTopics(
	sendRequester: HTTPSendRequester,
	args: { baseUrl: string; count: number },
): ForumTopic[] {
	const url = `${args.baseUrl}/latest.json?per_page=${args.count}`;

	const resp = sendRequester
		.sendRequest({
			method: 'GET',
			url,
			headers: { Accept: 'application/json' },
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`Forum request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(
		Buffer.from(resp.body).toString('utf-8'),
	) as ForumLatestResponse;

	return decoded.topic_list?.topics ?? [];
}

function postWebhook(
	sendRequester: HTTPSendRequester,
	args: {
		url: string;
		bearerToken?: string;
		payload: GovernanceOutputPayload;
	},
): string {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (args.bearerToken) headers.Authorization = `Bearer ${args.bearerToken}`;

	const resp = sendRequester
		.sendRequest({
			method: 'POST',
			url: args.url,
			headers,
			body: Buffer.from(JSON.stringify(args.payload)).toString('base64'),
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`webhook POST failed with status=${resp.statusCode}`);
	}

	return `status=${resp.statusCode}`;
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const http = new cre.capabilities.HTTPClient();
	const now = Date.now();

	// --- Fetch Snapshot proposals ---
	let proposals: GovernanceProposal[] = [];
	try {
		const rawProposals = http
			.sendRequest(
				runtime,
				fetchSnapshotProposals,
				consensusIdenticalAggregation<SnapshotProposal[]>(),
			)({
				url: runtime.config.snapshotGraphqlUrl,
				spaces: runtime.config.snapshotSpaces,
			})
			.result();

		proposals = rawProposals.map((p) => {
			const hoursRemaining =
				p.state === 'active'
					? (p.end * 1000 - now) / (1000 * 60 * 60)
					: null;
			const isUrgent =
				p.state === 'active' && hoursRemaining !== null && hoursRemaining < 24;

			return {
				id: p.id,
				title: p.title,
				space: p.space.id,
				state: p.state,
				start: p.start,
				end: p.end,
				votes: p.votes,
				scores_total: p.scores_total,
				choices: p.choices,
				scores: p.scores,
				author: p.author,
				hoursRemaining: hoursRemaining !== null ? Math.round(hoursRemaining * 100) / 100 : null,
				isUrgent,
			};
		});

		runtime.log(
			`Snapshot fetched | spaces=${runtime.config.snapshotSpaces.join(',')} proposals=${proposals.length} active=${proposals.filter((p) => p.state === 'active').length}`,
		);
	} catch (e) {
		runtime.log(`Snapshot fetch failed: ${e instanceof Error ? e.message : String(e)}`);
	}

	// --- Fetch forum topics ---
	let forumTopics: GovernanceForumTopic[] = [];
	try {
		const rawTopics = http
			.sendRequest(
				runtime,
				fetchForumTopics,
				consensusIdenticalAggregation<ForumTopic[]>(),
			)({
				baseUrl: runtime.config.forumBaseUrl,
				count: runtime.config.forumTopicCount,
			})
			.result();

		forumTopics = rawTopics.map((t) => ({
			id: t.id,
			title: t.title,
			slug: t.slug,
			postsCount: t.posts_count,
			lastPostedAt: t.last_posted_at,
			url: `${runtime.config.forumBaseUrl}/t/${t.slug}/${t.id}`,
		}));

		runtime.log(`Forum fetched | topics=${forumTopics.length}`);
	} catch (e) {
		runtime.log(`Forum fetch failed: ${e instanceof Error ? e.message : String(e)}`);
	}

	// --- Build summary ---
	const activeProposals = proposals.filter((p) => p.state === 'active');
	const urgentProposals = activeProposals.filter((p) => p.isUrgent);
	const closingSoon24h = activeProposals.filter(
		(p) => p.hoursRemaining !== null && p.hoursRemaining < 24,
	);

	const outputPayload: GovernanceOutputPayload = {
		timestamp: new Date().toISOString(),
		proposals,
		forumTopics,
		summary: {
			activeProposals: activeProposals.length,
			urgentProposals: urgentProposals.length,
			closingSoon24h: closingSoon24h.length,
			forumNewTopics: forumTopics.length,
		},
	};

	// --- Optional webhook ---
	if (runtime.config.webhook?.enabled && runtime.config.webhook.url) {
		try {
			const webhookResult = http
				.sendRequest(
					runtime,
					postWebhook,
					consensusIdenticalAggregation<string>(),
				)({
					url: runtime.config.webhook.url,
					bearerToken: runtime.config.webhook.bearerToken,
					payload: outputPayload,
				})
				.result();
			runtime.log(`Webhook delivered | ${webhookResult}`);
		} catch (e) {
			runtime.log(`Webhook delivery failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// Emit compact marker for run_snapshot parser reliability.
	runtime.log(`SENTINEL_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

	return safeJsonStringify(outputPayload);
}

// ---------- Init ----------

function initWorkflow(config: Config) {
	const cron = new cre.capabilities.CronCapability();
	return [
		cre.handler(
			cron.trigger({ schedule: config.schedule }),
			onCron,
		),
	];
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema });
	await runner.run(initWorkflow);
}

main();
